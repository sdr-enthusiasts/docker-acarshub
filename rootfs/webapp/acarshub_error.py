#!/usr/bin/env python3

def acars_traceback(e, source):
    traceback = e.__traceback__
    print(f"[{source}] An error has occurred: " + str(e))
    while traceback:
        print("{}: {}".format(traceback.tb_frame.f_code.co_filename, traceback.tb_lineno))
        traceback = traceback.tb_next
