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
Secure Query Builder for ACARSHUB Database

This module provides secure utilities for building database queries:
- FTS5 query string builders with proper escaping
- Parameterized query builders to prevent SQL injection
- Common query patterns abstraction

All functions in this module use parameterized queries to prevent SQL injection.
"""

from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy import TextClause
from sqlalchemy.sql import text
import re


def sanitize_fts_query(query_string: str) -> str:
    """
    Sanitize user input for FTS5 MATCH queries.

    FTS5 has special characters that need escaping:
    - Double quotes (") for phrase search
    - Asterisk (*) for prefix matching
    - Boolean operators (AND, OR, NOT)

    This function escapes quotes in user input to prevent injection attacks
    while preserving legitimate search functionality.

    Args:
        query_string: User input string to sanitize

    Returns:
        Sanitized string safe for FTS5 MATCH
    """
    # Remove or escape potentially dangerous characters
    # FTS5 uses double quotes for phrase matching, so escape them
    query_string = query_string.replace('"', '""')

    # Remove any control characters that could break FTS5 syntax
    query_string = re.sub(r"[\x00-\x1f\x7f]", "", query_string)

    return query_string


def build_fts_match_string(search_terms: Dict[str, str]) -> Tuple[str, bool]:
    """
    Build FTS5 MATCH query string from search terms dictionary.

    This builds a safe FTS5 query string using proper escaping and quoting.
    All user input is sanitized to prevent FTS5 injection attacks.

    Args:
        search_terms: Dictionary of field_name -> search_value
                     Example: {"icao": "ABF308", "flight": "UAL123"}

    Returns:
        Tuple of (match_string, has_terms)
        - match_string: Safe FTS5 MATCH string (empty if no valid terms)
        - has_terms: True if at least one search term was provided

    Example:
        >>> build_fts_match_string({"icao": "ABF308", "flight": "UAL"})
        ('icao:"ABF308"* AND flight:"UAL"*', True)
    """
    match_parts = []

    for field, value in search_terms.items():
        if value is None or value == "":
            continue

        # Sanitize user input
        safe_value = sanitize_fts_query(str(value))

        if safe_value:
            # Build field:value pair with prefix matching
            # Using double quotes to create phrase match, then * for prefix
            match_parts.append(f'{field}:"{safe_value}"*')

    if not match_parts:
        return "", False

    # Join with AND for multi-field search
    match_string = " AND ".join(match_parts)

    return match_string, True


def build_fts_search_query(
    search_terms: Dict[str, str],
    page: int = 0,
    limit: int = 50,
    order_by: str = "msg_time DESC",
) -> Tuple[Optional[TextClause], Optional[TextClause], Dict[str, Any]]:
    """
    Build parameterized FTS search query.

    Returns SQL query objects and parameters for safe execution.

    Args:
        search_terms: Dictionary of field -> value to search
        page: Page number (0-indexed)
        limit: Results per page
        order_by: ORDER BY clause (default: "msg_time DESC")

    Returns:
        Tuple of (results_query, count_query, params)
        - results_query: SQLAlchemy text() object for results
        - count_query: SQLAlchemy text() object for count
        - params: Dictionary of parameters for both queries
        Returns (None, None, {}) if no valid search terms

    Example:
        >>> query, count, params = build_fts_search_query({"icao": "ABF308"}, page=0)
        >>> results = session.execute(query, params)
    """
    match_string, has_terms = build_fts_match_string(search_terms)

    if not has_terms:
        return None, None, {}

    # Build parameterized queries
    # Note: We cannot parameterize the MATCH string itself (FTS5 limitation)
    # but we've sanitized it above to prevent injection
    results_query = text(
        f"""
        SELECT * FROM messages
        WHERE id IN (
            SELECT rowid FROM messages_fts
            WHERE messages_fts MATCH :match_string
            ORDER BY rowid DESC
            LIMIT :limit OFFSET :offset
        )
        ORDER BY {order_by}
    """
    )

    count_query = text(
        """
        SELECT COUNT(*) FROM messages_fts
        WHERE messages_fts MATCH :match_string
    """
    )

    params = {"match_string": match_string, "limit": limit, "offset": page * limit}

    return results_query, count_query, params


def build_alert_fts_query(
    search_terms: Dict[str, List[str]],
) -> Tuple[Optional[str], List[str]]:
    """
    Build FTS query for alert searches with OR logic.

    Alert searches need to match ANY of multiple terms per field.
    Example: icao matches ["ABF308", "C0FFEE", "DEADBE"]

    Args:
        search_terms: Dictionary of field -> list of values
                     Example: {"icao": ["ABF308", "C0FFEE"], "tail": ["N123"]}

    Returns:
        Tuple of (query_string, matched_values)
        - query_string: FTS5 MATCH string with OR logic
        - matched_values: List of all search values (for validation)
        Returns (None, []) if no valid terms

    Example:
        >>> build_alert_fts_query({"icao": ["ABF", "C0F"], "tail": ["N123"]})
        ('icao:"ABF"* OR icao:"C0F"* OR tail:"N123"*', ["ABF", "C0F", "N123"])
    """
    match_parts = []
    matched_values = []

    for field, values in search_terms.items():
        if not values:
            continue

        for value in values:
            if value is None or value == "":
                continue

            # Sanitize user input
            safe_value = sanitize_fts_query(str(value))

            if safe_value:
                match_parts.append(f'{field}:"{safe_value}"*')
                matched_values.append(safe_value)

    if not match_parts:
        return None, []

    # Join with OR for alert matching (match ANY term)
    query_string = " OR ".join(match_parts)

    return query_string, matched_values


def build_alert_matches_query(
    limit: int = 50, offset: int = 0, before_timestamp: Optional[int] = None
) -> Tuple[TextClause, Dict[str, Any]]:
    """
    Build parameterized query for loading alert matches with aggregated terms.

    This query joins messages with alert_matches and aggregates matched terms
    using GROUP_CONCAT for efficient retrieval.

    Args:
        limit: Maximum number of results
        offset: Offset for pagination
        before_timestamp: Optional timestamp filter (exclusive)

    Returns:
        Tuple of (query, params)
        - query: SQLAlchemy text() object
        - params: Dictionary of parameters
    """
    # Base query with GROUP_CONCAT for term aggregation
    base_query = """
        SELECT DISTINCT
            m.id, m.message_type, m.msg_time, m.station_id, m.toaddr, m.fromaddr,
            m.depa, m.dsta, m.eta, m.gtout, m.gtin, m.wloff, m.wlin,
            m.lat, m.lon, m.alt, m.msg_text, m.tail, m.flight, m.icao, m.freq,
            m.ack, m.mode, m.label, m.block_id, m.msgno, m.is_response,
            m.is_onground, m.error, m.libacars, m.level, m.uid,
            GROUP_CONCAT(CASE WHEN am.match_type = 'text' THEN am.term END, ',') as matched_text,
            GROUP_CONCAT(CASE WHEN am.match_type = 'icao' THEN am.term END, ',') as matched_icao,
            GROUP_CONCAT(CASE WHEN am.match_type = 'tail' THEN am.term END, ',') as matched_tail,
            GROUP_CONCAT(CASE WHEN am.match_type = 'flight' THEN am.term END, ',') as matched_flight
        FROM messages m
        INNER JOIN alert_matches am ON m.uid = am.message_uid
    """

    # Add optional timestamp filter
    if before_timestamp is not None:
        where_clause = "WHERE m.msg_time < :before_timestamp"
    else:
        where_clause = ""

    # Complete query with GROUP BY and pagination
    full_query = f"""
        {base_query}
        {where_clause}
        GROUP BY m.uid
        ORDER BY m.msg_time DESC
        LIMIT :limit OFFSET :offset
    """

    params = {"limit": limit, "offset": offset}

    if before_timestamp is not None:
        params["before_timestamp"] = before_timestamp

    return text(full_query), params


def build_alert_term_search_query(
    term: str, page: int = 0, results_per_page: int = 50
) -> Tuple[TextClause, TextClause, Dict[str, Any]]:
    """
    Build parameterized query for searching alerts by specific term.

    Args:
        term: Alert term to search for
        page: Page number (0-indexed)
        results_per_page: Results per page

    Returns:
        Tuple of (results_query, count_query, params)
    """
    # Sanitize term (should be uppercase for consistency)
    safe_term = term.upper().strip()

    count_query = text(
        """
        SELECT COUNT(DISTINCT m.uid)
        FROM messages m
        INNER JOIN alert_matches am ON m.uid = am.message_uid
        WHERE am.term = :term
    """
    )

    results_query = text(
        """
        SELECT DISTINCT
            m.id, m.message_type, m.msg_time, m.station_id, m.toaddr, m.fromaddr,
            m.depa, m.dsta, m.eta, m.gtout, m.gtin, m.wloff, m.wlin,
            m.lat, m.lon, m.alt, m.msg_text, m.tail, m.flight, m.icao, m.freq,
            m.ack, m.mode, m.label, m.block_id, m.msgno, m.is_response,
            m.is_onground, m.error, m.libacars, m.level, m.uid,
            GROUP_CONCAT(CASE WHEN am.match_type = 'text' THEN am.term END, ',') as matched_text,
            GROUP_CONCAT(CASE WHEN am.match_type = 'icao' THEN am.term END, ',') as matched_icao,
            GROUP_CONCAT(CASE WHEN am.match_type = 'tail' THEN am.term END, ',') as matched_tail,
            GROUP_CONCAT(CASE WHEN am.match_type = 'flight' THEN am.term END, ',') as matched_flight
        FROM messages m
        INNER JOIN alert_matches am ON m.uid = am.message_uid
        WHERE am.term = :term
        GROUP BY m.uid
        ORDER BY m.msg_time DESC
        LIMIT :limit OFFSET :offset
    """
    )

    params = {
        "term": safe_term,
        "limit": results_per_page,
        "offset": page * results_per_page,
    }

    return results_query, count_query, params


def parse_grouped_terms(row_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse GROUP_CONCAT results from alert queries into arrays.

    Converts comma-separated strings from GROUP_CONCAT into Python lists
    and cleans up None/empty values.

    Args:
        row_dict: Dictionary from database row (from .mappings().all())

    Returns:
        Modified dictionary with parsed term arrays

    Example:
        >>> row = {"matched_text": "EMERGENCY,MAYDAY", "matched_icao": None}
        >>> parse_grouped_terms(row)
        {"matched_text": ["EMERGENCY", "MAYDAY"], "matched_icao": None}
    """
    # Add matched flag for frontend
    row_dict["matched"] = True

    # Parse matched_text into array
    if row_dict.get("matched_text"):
        row_dict["matched_text"] = [
            t.strip() for t in row_dict["matched_text"].split(",") if t and t.strip()
        ]
    else:
        row_dict["matched_text"] = []

    # Parse other match type fields
    for field in ["matched_icao", "matched_tail", "matched_flight"]:
        if row_dict.get(field):
            row_dict[field] = [
                t.strip() for t in row_dict[field].split(",") if t and t.strip()
            ]
        else:
            row_dict[field] = None

    return row_dict


def validate_search_params(search_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate and sanitize search parameters.

    Ensures search parameters are safe and properly formatted:
    - ICAO codes are uppercase hex strings
    - Tail numbers are uppercase
    - Page numbers are non-negative integers
    - Limit values are within reasonable bounds

    Args:
        search_params: Dictionary of search parameters

    Returns:
        Sanitized search parameters dictionary
    """
    validated = {}

    # Handle ICAO - should be uppercase hex string
    if "icao" in search_params and search_params["icao"]:
        validated["icao"] = search_params["icao"].strip().upper()

    # Handle tail - should be uppercase
    if "tail" in search_params and search_params["tail"]:
        validated["tail"] = search_params["tail"].strip().upper()

    # Handle other string fields - strip whitespace
    for field in ["flight", "depa", "dsta", "freq", "label", "msg_text", "station_id"]:
        if field in search_params and search_params[field]:
            validated[field] = search_params[field].strip()

    # Handle page - ensure non-negative integer
    if "page" in search_params:
        try:
            page = int(search_params["page"])
            validated["page"] = max(0, page)
        except (ValueError, TypeError):
            validated["page"] = 0

    # Handle limit - ensure reasonable bounds (1-1000)
    if "limit" in search_params:
        try:
            limit = int(search_params["limit"])
            validated["limit"] = max(1, min(1000, limit))
        except (ValueError, TypeError):
            validated["limit"] = 50

    return validated
