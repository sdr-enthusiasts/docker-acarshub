#!/bin/bash

# echo "==== Checking acarsdec-00012095 ====="
# echo "UDP4 connection between 127.0.0.1:ANY and 127.0.0.1:5550 for PID 361 established: PASS"
# echo "Decoder acarsdec-00012095 (pid 361) is connected to acars_server at 127.0.0.1:5550: HEALTHY"
# echo "==== Checking vdlm2dec-00012507 ====="
# echo "UDP4 connection between 127.0.0.1:ANY and 127.0.0.1:5555 for PID 354 established: PASS"
# echo "Decoder vdlm2dec-00012507 (pid 354) is connected to vdlm2_server at 127.0.0.1:5555: HEALTHY"
# echo "==== Checking vdlm2_server ====="
# echo "TCP4 listening on 127.0.0.1:15555 (tcp) for PID 359: PASS"
# echo "vdlm2_server TCP listening on port 15555 (pid 359): HEALTHY"
# echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for python3 established: PASS"
# echo "vdlm2_server TCP connected to python server on port 15555 (pid $vdlm2_pidof_vdlm2_tcp_server): HEALTHY"
# echo "==== Checking vdlm2_stats ====="
# echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for PID 8366 established: PASS"
# echo "vdlm2_stats (pid 8366) connected to acars_server (pid 359) at 127.0.0.1:15555: HEALTHY"
# echo "==== Check for VDLM2 activity ====="
# echo "1634 VDLM2 messages received in past hour: HEALTHY"
# echo "==== Checking acars_server ====="
# echo "TCP4 listening on 127.0.0.1:15550 (tcp) for PID 380: PASS"
# echo "acars_server TCP listening on port 15550 (pid 380): HEALTHY"
# echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for python3 established: PASS"
# echo "acars_server TCP connected to python3 server on port 15550: HEALTHY"
# echo "==== Checking acars_stats ====="
# echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for PID 8367 established: PASS"
# echo "acars_stats (pid 8367) connected to acars_server (pid 380) at 127.0.0.1:15550: HEALTHY"
# echo "==== Check for ACARS activity ====="
# echo "624 ACARS messages received in past hour: HEALTHY"
# echo "==== Check webapp ====="
# echo "webapp available: HEALTHY"
# echo "==== Check Service Death Tallies ====="
# echo "abnormal death tally for vdlm2_server since last check is: 0: HEALTHY"
# echo "abnormal death tally for vdlm2_feeder since last check is: 0: HEALTHY"
# echo "abnormal death tally for webapp since last check is: 0: HEALTHY"
# echo "abnormal death tally for acars_stats since last check is: 0: HEALTHY"
# echo "abnormal death tally for vdlm2_stats since last check is: 0: HEALTHY"
# echo "abnormal death tally for vdlm2dec-00012507 since last check is: 0: HEALTHY"
# echo "abnormal death tally for acars_feeder since last check is: 0: HEALTHY"
# echo "abnormal death tally for acarsdec-00012095 since last check is: 0: HEALTHY"
# echo "abnormal death tally for acars_server since last check is: 0: HEALTHY"

# echo "==== Checking acarsdec-00012095 ====="
# echo "UDP4 connection between 127.0.0.1:ANY and 127.0.0.1:5550 for PID 354 established: PASS"
# echo "Decoder acarsdec-00012095 (pid 354) is connected to acars_server at 127.0.0.1:5550: HEALTHY"
# echo "==== Checking vdlm2dec-00012507 ====="
# echo "Cannot find PID of decoder vdlm2dec-00012507: UNHEALTHY"
# echo "==== Checking vdlm2_server ====="
# echo "TCP4 listening on 127.0.0.1:15555 (tcp) for PID 380: PASS"
# echo "vdlm2_server TCP listening on port 15555 (pid 380): HEALTHY"
# echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for python3 established: PASS"
# echo "vdlm2_server TCP connected to python server on port 15555: HEALTHY"
# echo "==== Checking vdlm2_stats ====="
# echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for PID 159856 established: PASS"
# echo "vdlm2_stats (pid 159856) connected to acars_server (pid 380) at 127.0.0.1:15555: HEALTHY"
# echo "==== Check for VDLM2 activity ====="
# echo "0 VDLM2 messages received in past hour: UNHEALTHY"
# echo "==== Checking acars_server ====="
# echo "TCP4 listening on 127.0.0.1:15550 (tcp) for PID 384: PASS"
# echo "acars_server TCP listening on port 15550 (pid 384): HEALTHY"
# echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for python3 established: PASS"
# echo "acars_server TCP connected to python3 server on port 15550: HEALTHY"
# echo "==== Checking acars_stats ====="
# echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for PID 159854 established: PASS"
# echo "acars_stats (pid 159854) connected to acars_server (pid 384) at 127.0.0.1:15550: HEALTHY"
# echo "==== Check for ACARS activity ====="
# echo "872 ACARS messages received in past hour: HEALTHY"
# echo "==== Check webapp ====="
# echo "webapp available: HEALTHY"
# echo "==== Check Service Death Tallies ====="
# echo "abnormal death tally for vdlm2_server since last check is: 0: HEALTHY"
# echo "abnormal death tally for vdlm2_feeder since last check is: 0: HEALTHY"
# echo "abnormal death tally for webapp since last check is: 0: HEALTHY"
# echo "abnormal death tally for acars_stats since last check is: 0: HEALTHY"
# echo "abnormal death tally for vdlm2_stats since last check is: 0: HEALTHY"
# echo "abnormal death tally for vdlm2dec-00012507 since last check is: 4: UNHEALTHY"
# echo "abnormal death tally for acars_feeder since last check is: 0: HEALTHY"
# echo "abnormal death tally for acarsdec-00012095 since last check is: 0: HEALTHY"
# echo "abnormal death tally for acars_server since last check is: 0: HEALTHY"

echo "==== Checking acarsdec-GEN-BLACK ====="
echo "UDP4 connection between 127.0.0.1:ANY and 127.0.0.1:5550 for PID 335 established: PASS"
echo "Decoder acarsdec-GEN-BLACK (pid 335) is connected to acars_server at 127.0.0.1:5550: HEALTHY"
echo "==== Checking acarsdec-NESDR-M2P ====="
echo "UDP4 connection between 127.0.0.1:ANY and 127.0.0.1:5550 for PID 330 established: PASS"
echo "Decoder acarsdec-NESDR-M2P (pid 330) is connected to acars_server at 127.0.0.1:5550: HEALTHY"
echo "==== Checking vdlm2dec-NENANO3-ACARS ====="
echo "UDP4 connection between 127.0.0.1:ANY and 127.0.0.1:5555 for PID 343 established: PASS"
echo "Decoder vdlm2dec-NENANO3-ACARS (pid 343) is connected to vdlm2_server at 127.0.0.1:5555: HEALTHY"
echo "==== Checking vdlm2_server ====="
echo "TCP4 listening on 127.0.0.1:15555 (tcp) for PID 371: PASS"
echo "vdlm2_server TCP listening on port 15555 (pid 371): HEALTHY"
echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for python3 established: PASS"
echo "vdlm2_server TCP connected to python server on port 15555: HEALTHY"
echo "==== Checking vdlm2_feeder ====="
echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for PID 452 established: PASS"
echo "vdlm2_feeder (pid 452) is connected to vdlm2_server (pid 371) at 127.0.0.1:15555: HEALTHY"
echo "UDP4 connection between ANY:ANY and ANY:5555 for PID 452 established: PASS"
echo "vdlm2_feeder (pid 452) is feeding: HEALTHY"
echo "==== Checking vdlm2_stats ====="
echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for PID 5759 established: PASS"
echo "vdlm2_stats (pid 5759) connected to acars_server (pid 371) at 127.0.0.1:15555: HEALTHY"
echo "==== Check for VDLM2 activity ====="
echo "0 VDLM2 messages received in past hour: UNHEALTHY"
echo "==== Checking acars_server ====="
echo "TCP4 listening on 127.0.0.1:15550 (tcp) for PID 378: PASS"
echo "acars_server TCP listening on port 15550 (pid 378): HEALTHY"
echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for python3 established: PASS"
echo "acars_server TCP connected to python3 server on port 15550: HEALTHY"
echo "==== Checking acars_feeder ====="
echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for PID 446 established: PASS"
echo "acars_feeder (pid 446) is connected to acars_server (pid 378) at 127.0.0.1:15550: HEALTHY"
echo "UDP4 connection between ANY:ANY and ANY:5550 for PID 446 established: PASS"
echo "acars_feeder (pid 446) is feeding: HEALTHY"
echo "==== Checking acars_stats ====="
echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for PID 5763 established: PASS"
echo "acars_stats (pid 5763) connected to acars_server (pid 378) at 127.0.0.1:15550: HEALTHY"
echo "==== Check for ACARS activity ====="
echo "30 ACARS messages received in past hour: HEALTHY"
echo "==== Check webapp ====="
echo "webapp available: HEALTHY"
echo "==== Check Service Death Tallies ====="
echo "abnormal death tally for vdlm2_server since last check is: 0: HEALTHY"
echo "abnormal death tally for webapp since last check is: 0: HEALTHY"
echo "abnormal death tally for vdlm2dec-NENANO3-ACARS since last check is: 0: HEALTHY"
echo "abnormal death tally for acarsdec-NESDR-M2P since last check is: 0: HEALTHY"
echo "abnormal death tally for acars_stats since last check is: 0: HEALTHY"
echo "abnormal death tally for vdlm2_feeder since last check is: 0: HEALTHY"
echo "abnormal death tally for acars_feeder since last check is: 0: HEALTHY"
echo "abnormal death tally for vdlm2_stats since last check is: 0: HEALTHY"
echo "abnormal death tally for acars_server since last check is: 0: HEALTHY"
echo "abnormal death tally for acarsdec-GEN-BLACK since last check is: 0: HEALTHY"
