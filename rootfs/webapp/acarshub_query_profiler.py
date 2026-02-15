#!/usr/bin/env python3

# Copyright (C) 2022-2026 Frederick Clausen II
# This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
#
# acarshub is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# acarshub is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

"""
Query Performance Profiler for ACARSHUB

This module provides utilities for monitoring database query performance:
- Query execution time tracking
- Slow query logging
- Query statistics collection
- Performance debugging helpers

Usage:
    from acarshub_query_profiler import profile_query, log_slow_query

    # Option 1: Context manager
    with profile_query("search_alerts", params={"term": "emergency"}):
        result = session.execute(query)

    # Option 2: Manual timing
    timer = QueryTimer("database_search")
    # ... execute query ...
    timer.log_if_slow(threshold_ms=1000)
"""

import time
import functools
from contextlib import contextmanager
from typing import Dict, Any, Optional, Callable
import acarshub_logging
from acarshub_logging import LOG_LEVEL

# Global configuration
SLOW_QUERY_THRESHOLD_MS = 1000  # Log queries slower than 1 second
VERY_SLOW_QUERY_THRESHOLD_MS = 5000  # Warn about queries slower than 5 seconds

# Query statistics (can be used for monitoring/metrics)
query_stats = {
    "total_queries": 0,
    "slow_queries": 0,
    "total_time_ms": 0.0,
    "by_operation": {},  # operation_name -> {count, total_time_ms, slow_count}
}


class QueryTimer:
    """
    Timer for tracking individual query execution time.

    Usage:
        timer = QueryTimer("database_search")
        # ... execute query ...
        timer.stop()
        timer.log_if_slow(threshold_ms=1000)
    """

    def __init__(self, operation_name: str, params: Optional[Dict[str, Any]] = None):
        """
        Initialize query timer.

        Args:
            operation_name: Name of the database operation (e.g., "database_search")
            params: Optional dict of query parameters for debugging
        """
        self.operation_name = operation_name
        self.params = params or {}
        self.start_time = time.time()
        self.end_time = None
        self.duration_ms = None

    def stop(self) -> float:
        """
        Stop the timer and return duration in milliseconds.

        Returns:
            Duration in milliseconds
        """
        if self.end_time is None:
            self.end_time = time.time()
            self.duration_ms = (self.end_time - self.start_time) * 1000
        # duration_ms is guaranteed to be set after the if block above
        assert self.duration_ms is not None
        return self.duration_ms

    def log_if_slow(
        self,
        threshold_ms: Optional[float] = None,
        warn_threshold_ms: Optional[float] = None,
    ) -> bool:
        """
        Log query if it exceeded the slow threshold.

        Args:
            threshold_ms: Threshold in ms to log (default: SLOW_QUERY_THRESHOLD_MS)
            warn_threshold_ms: Threshold in ms to warn (default: VERY_SLOW_QUERY_THRESHOLD_MS)

        Returns:
            True if query was slow, False otherwise
        """
        if self.duration_ms is None:
            self.stop()

        # After calling stop(), duration_ms is guaranteed to be set
        assert self.duration_ms is not None

        threshold_ms = threshold_ms or SLOW_QUERY_THRESHOLD_MS
        warn_threshold_ms = warn_threshold_ms or VERY_SLOW_QUERY_THRESHOLD_MS

        # Update global statistics
        # global query_stats
        query_stats["total_queries"] += 1
        query_stats["total_time_ms"] += self.duration_ms

        # Update per-operation statistics
        if self.operation_name not in query_stats["by_operation"]:
            query_stats["by_operation"][self.operation_name] = {
                "count": 0,
                "total_time_ms": 0.0,
                "slow_count": 0,
            }

        op_stats = query_stats["by_operation"][self.operation_name]
        op_stats["count"] += 1
        op_stats["total_time_ms"] += self.duration_ms

        # Check if slow
        is_slow = self.duration_ms >= threshold_ms

        if is_slow:
            query_stats["slow_queries"] += 1
            op_stats["slow_count"] += 1

            # Determine log level based on how slow
            if self.duration_ms >= warn_threshold_ms:
                log_level = LOG_LEVEL["WARNING"]
                severity = "VERY SLOW"
            else:
                log_level = LOG_LEVEL["INFO"]
                severity = "SLOW"

            # Format parameters for logging (truncate long values)
            params_str = ", ".join(
                f"{k}={self._truncate_value(v)}" for k, v in self.params.items()
            )
            if params_str:
                params_str = f" [{params_str}]"

            acarshub_logging.log(
                f"{severity} QUERY: {self.operation_name}{params_str} took {self.duration_ms:.2f}ms",
                "database",
                level=log_level,
            )

        return is_slow

    def _truncate_value(self, value: Any, max_len: int = 50) -> str:
        """Truncate long values for logging."""
        value_str = str(value)
        if len(value_str) > max_len:
            return value_str[: max_len - 3] + "..."
        return value_str


@contextmanager
def profile_query(
    operation_name: str,
    params: Optional[Dict[str, Any]] = None,
    threshold_ms: Optional[float] = None,
):
    """
    Context manager for profiling database queries.

    Usage:
        with profile_query("search_alerts", params={"term": "emergency"}):
            result = session.execute(query)

    Args:
        operation_name: Name of the database operation
        params: Optional dict of query parameters for debugging
        threshold_ms: Custom slow query threshold (default: SLOW_QUERY_THRESHOLD_MS)
    """
    timer = QueryTimer(operation_name, params)
    try:
        yield timer
    finally:
        timer.stop()
        timer.log_if_slow(threshold_ms=threshold_ms)


def profile_function(
    operation_name: Optional[str] = None, threshold_ms: Optional[float] = None
) -> Callable:
    """
    Decorator for profiling database functions.

    Usage:
        @profile_function("database_search", threshold_ms=500)
        def database_search(search_term, page=0):
            # ... query code ...
            return result

    Args:
        operation_name: Name of the operation (default: function name)
        threshold_ms: Custom slow query threshold (default: SLOW_QUERY_THRESHOLD_MS)
    """

    def decorator(func: Callable) -> Callable:
        op_name = operation_name or func.__name__

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Extract meaningful parameters for logging (avoid logging entire objects)
            params = {}
            if args:
                params["args_count"] = len(args)
            if kwargs:
                # Only include simple types in params
                params.update(
                    {
                        k: v
                        for k, v in kwargs.items()
                        if isinstance(v, (str, int, float, bool, type(None)))
                    }
                )

            with profile_query(op_name, params=params, threshold_ms=threshold_ms):
                return func(*args, **kwargs)

        return wrapper

    return decorator


def get_query_stats() -> Dict[str, Any]:
    """
    Get current query performance statistics.

    Returns:
        Dictionary with query statistics:
        - total_queries: Total number of queries executed
        - slow_queries: Number of slow queries
        - total_time_ms: Total query execution time in ms
        - avg_time_ms: Average query time in ms
        - by_operation: Per-operation statistics
    """
    stats = query_stats.copy()

    # Calculate average query time
    if stats["total_queries"] > 0:
        stats["avg_time_ms"] = stats["total_time_ms"] / stats["total_queries"]
    else:
        stats["avg_time_ms"] = 0.0

    # Calculate average times per operation
    for op_name, op_stats in stats["by_operation"].items():
        if op_stats["count"] > 0:
            op_stats["avg_time_ms"] = op_stats["total_time_ms"] / op_stats["count"]
        else:
            op_stats["avg_time_ms"] = 0.0

    return stats


def log_query_stats(reset: bool = False) -> None:
    """
    Log current query performance statistics.

    Args:
        reset: If True, reset statistics after logging
    """
    stats = get_query_stats()

    acarshub_logging.log(
        f"Query Statistics: {stats['total_queries']} total, "
        f"{stats['slow_queries']} slow ({stats['slow_queries'] / max(stats['total_queries'], 1) * 100:.1f}%), "
        f"avg {stats['avg_time_ms']:.2f}ms",
        "database",
        level=LOG_LEVEL["INFO"],
    )

    # Log per-operation stats if there are slow queries
    if stats["slow_queries"] > 0:
        acarshub_logging.log("Per-operation statistics:", "database")
        for op_name, op_stats in sorted(
            stats["by_operation"].items(),
            key=lambda x: x[1]["total_time_ms"],
            reverse=True,
        ):
            if op_stats["slow_count"] > 0:
                acarshub_logging.log(
                    f"  {op_name}: {op_stats['count']} queries, "
                    f"{op_stats['slow_count']} slow, "
                    f"avg {op_stats['avg_time_ms']:.2f}ms",
                    "database",
                    level=LOG_LEVEL["INFO"],
                )

    if reset:
        reset_query_stats()


def reset_query_stats() -> None:
    """Reset query statistics."""
    global query_stats
    query_stats = {
        "total_queries": 0,
        "slow_queries": 0,
        "total_time_ms": 0.0,
        "by_operation": {},
    }


def log_slow_query(
    operation_name: str,
    duration_ms: float,
    query_text: Optional[str] = None,
    params: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Manually log a slow query (for cases where context manager can't be used).

    Args:
        operation_name: Name of the database operation
        duration_ms: Query duration in milliseconds
        query_text: Optional SQL query text (will be truncated)
        params: Optional query parameters
    """
    severity = "VERY SLOW" if duration_ms >= VERY_SLOW_QUERY_THRESHOLD_MS else "SLOW"
    log_level = (
        LOG_LEVEL["WARNING"]
        if duration_ms >= VERY_SLOW_QUERY_THRESHOLD_MS
        else LOG_LEVEL["INFO"]
    )

    msg_parts = [f"{severity} QUERY: {operation_name} took {duration_ms:.2f}ms"]

    if params:
        params_str = ", ".join(f"{k}={v}" for k, v in list(params.items())[:5])
        msg_parts.append(f"Params: {params_str}")

    if query_text:
        # Truncate and clean up query text
        query_clean = " ".join(query_text.split())
        if len(query_clean) > 200:
            query_clean = query_clean[:200] + "..."
        msg_parts.append(f"Query: {query_clean}")

    acarshub_logging.log(" | ".join(msg_parts), "database", level=log_level)
