#!/usr/bin/env python3

# Copyright (C) 2022-2024 Frederick Clausen II
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

from prometheus_client import Gauge, Info, generate_latest

# Debug metric for RRD status
RRD_DEBUG = Gauge("acarshub_rrd_debug_info", "RRD debug information", ["status"])

# Database statistics
DB_METRICS = {
    "total_messages": Gauge(
        "acarshub_database_messages_total", "Total number of messages in database"
    ),
    "database_size_bytes": Gauge(
        "acarshub_database_size_bytes", "Database file size in bytes"
    ),
    "non_empty_messages": Gauge(
        "acarshub_database_non_empty_messages_total", "Total non-empty messages"
    ),
    "non_empty_errors": Gauge(
        "acarshub_database_non_empty_errors_total",
        "Total non-empty messages with errors",
    ),
    "empty_messages": Gauge(
        "acarshub_database_empty_messages_total", "Total empty messages"
    ),
    "empty_errors": Gauge(
        "acarshub_database_empty_errors_total", "Total empty messages with errors"
    ),
}

# RRD data gauges (1-minute averages)
RRD_GAUGES = {
    "acars": Gauge(
        "acarshub_rrd_acars_messages_per_minute", "1-minute average ACARS messages"
    ),
    "vdlm": Gauge(
        "acarshub_rrd_vdlm_messages_per_minute", "1-minute average VDLM messages"
    ),
    "total": Gauge(
        "acarshub_rrd_total_messages_per_minute", "1-minute average total messages"
    ),
    "error": Gauge(
        "acarshub_rrd_error_messages_per_minute", "1-minute average error messages"
    ),
    "hfdl": Gauge(
        "acarshub_rrd_hfdl_messages_per_minute", "1-minute average HFDL messages"
    ),
    "imsl": Gauge(
        "acarshub_rrd_imsl_messages_per_minute", "1-minute average IMSL messages"
    ),
    "irdm": Gauge(
        "acarshub_rrd_irdm_messages_per_minute", "1-minute average IRDM messages"
    ),
}

# Signal level distribution
SIGNAL_LEVEL_GAUGE = Gauge(
    "acarshub_signal_level_distribution", "Signal level distribution", ["level"]
)

# Frequency distribution
FREQUENCY_GAUGE = Gauge(
    "acarshub_frequency_distribution",
    "Message count by frequency",
    ["frequency", "type"],
)

# Alert metrics
ALERT_METRICS = {
    "terms_configured": Gauge(
        "acarshub_alert_terms_configured", "Number of alert terms configured"
    ),
    "term_matches": Gauge(
        "acarshub_alert_term_matches", "Alert term match counts", ["term"]
    ),
    "saved_messages": Gauge(
        "acarshub_alert_saved_messages_total", "Total number of saved alert messages"
    ),
}

# Application info
APP_INFO = Info("acarshub_application", "Application information")


def update_metrics():
    """Update all metrics with current values from database and RRD data"""
    import rrdtool
    from acarshub_database import (
        database_get_row_count,
        get_errors,
        get_freq_count,
        get_signal_levels,
        get_alert_counts,
        get_alert_terms,
    )
    from acarshub_configuration import get_version
    import acarshub_configuration

    # Update RRD data
    try:
        import os

        rrd_path = "/run/acars/acarshub.rrd"

        # Check if RRD file exists
        if not os.path.exists(rrd_path):
            RRD_DEBUG.labels(status="file_not_found").set(1)
            return

        RRD_DEBUG.labels(status="file_exists").set(1)

        # Try to fetch the most recent data point
        # Use a longer time range to ensure we get data
        rrd_data = rrdtool.fetch(rrd_path, "AVERAGE", "-s", "-300s", "-e", "now")

        if not rrd_data:
            RRD_DEBUG.labels(status="no_data_returned").set(1)
            return

        if len(rrd_data) < 3:
            RRD_DEBUG.labels(status="invalid_data_structure").set(1)
            return

        if not rrd_data[2]:
            RRD_DEBUG.labels(status="empty_data_array").set(1)
            return

        RRD_DEBUG.labels(status="data_points_found").set(len(rrd_data[2]))

        # RRD data sources order: ACARS:VDLM:TOTAL:ERROR:HFDL:IMSL:IRDM
        # Find the most recent non-None data point
        latest = None
        for i, data_point in enumerate(reversed(rrd_data[2])):
            if data_point and any(x is not None for x in data_point):
                latest = data_point
                RRD_DEBUG.labels(status="latest_data_index").set(
                    len(rrd_data[2]) - 1 - i
                )
                break

        if latest:
            RRD_DEBUG.labels(status="data_successfully_parsed").set(1)
            RRD_GAUGES["acars"].set(latest[0] or 0)  # ACARS
            RRD_GAUGES["vdlm"].set(latest[1] or 0)  # VDLM
            RRD_GAUGES["total"].set(latest[2] or 0)  # TOTAL
            RRD_GAUGES["error"].set(latest[3] or 0)  # ERROR
            RRD_GAUGES["hfdl"].set(latest[4] or 0)  # HFDL
            RRD_GAUGES["imsl"].set(latest[5] or 0)  # IMSL
            RRD_GAUGES["irdm"].set(latest[6] or 0)  # IRDM
        else:
            RRD_DEBUG.labels(status="no_valid_data_points").set(1)

    except rrdtool.error:
        RRD_DEBUG.labels(status="rrdtool_error").set(1)
    except FileNotFoundError:
        RRD_DEBUG.labels(status="file_not_found_exception").set(1)
    except Exception:
        RRD_DEBUG.labels(status="unknown_error").set(1)

    # Update database statistics
    try:
        total_messages, db_size = database_get_row_count()
        if total_messages is not None:
            DB_METRICS["total_messages"].set(total_messages)
        if db_size is not None:
            DB_METRICS["database_size_bytes"].set(db_size)

        # Get error statistics
        error_stats = get_errors()
        DB_METRICS["non_empty_messages"].set(error_stats.get("non_empty_total", 0))
        DB_METRICS["non_empty_errors"].set(error_stats.get("non_empty_errors", 0))
        DB_METRICS["empty_messages"].set(error_stats.get("empty_total", 0))
        DB_METRICS["empty_errors"].set(error_stats.get("empty_errors", 0))
    except Exception:
        pass  # Database might not be available

    # Update signal level distribution
    try:
        signal_levels = get_signal_levels()
        # Clear existing signal level metrics
        SIGNAL_LEVEL_GAUGE.clear()
        for level_data in signal_levels:
            SIGNAL_LEVEL_GAUGE.labels(level=str(level_data["level"])).set(
                level_data["count"]
            )
    except Exception:
        pass

    # Update frequency distribution
    try:
        freq_counts = get_freq_count()
        # Clear existing frequency metrics
        FREQUENCY_GAUGE.clear()
        for freq_data in freq_counts:
            FREQUENCY_GAUGE.labels(
                frequency=freq_data["freq"], type=freq_data["freq_type"]
            ).set(freq_data["count"])
    except Exception:
        pass

    # Update alert metrics
    try:
        alert_terms = get_alert_terms()
        ALERT_METRICS["terms_configured"].set(len(alert_terms))

        # Clear existing alert term metrics
        ALERT_METRICS["term_matches"].clear()
        alert_counts = get_alert_counts()
        for alert in alert_counts:
            ALERT_METRICS["term_matches"].labels(term=alert["term"]).set(alert["count"])

        # Count saved alert messages (from messages_saved table)
        from acarshub_database import db_session, messages_saved

        try:
            session = db_session()
            saved_count = session.query(messages_saved).count()
            ALERT_METRICS["saved_messages"].set(saved_count)
        except Exception:
            pass
        finally:
            if "session" in locals():
                session.close()
    except Exception:
        pass

    # Update application info
    try:
        version_info = get_version()
        APP_INFO.info(
            {
                "version": version_info.get("local", "unknown"),
                "arch": getattr(acarshub_configuration, "ARCH", "unknown"),
                "acars_enabled": str(
                    getattr(acarshub_configuration, "ENABLE_ACARS", False)
                ),
                "vdlm_enabled": str(
                    getattr(acarshub_configuration, "ENABLE_VDLM", False)
                ),
                "hfdl_enabled": str(
                    getattr(acarshub_configuration, "ENABLE_HFDL", False)
                ),
                "imsl_enabled": str(
                    getattr(acarshub_configuration, "ENABLE_IMSL", False)
                ),
                "irdm_enabled": str(
                    getattr(acarshub_configuration, "ENABLE_IRDM", False)
                ),
                "adsb_enabled": str(
                    getattr(acarshub_configuration, "ENABLE_ADSB", False)
                ),
            }
        )
    except Exception:
        pass


def get_metrics():
    """Generate the latest metrics in Prometheus format"""
    update_metrics()
    return generate_latest()
