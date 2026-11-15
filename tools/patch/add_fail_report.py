#!/usr/bin/env python3
"""Add a failure report to patch launchers: python3 add_fail_report.py LAUNCHER...

When the install fails, the launcher writes its output to TETRIO-patch-update-error.txt on the
Desktop and prints where (user: if an update fails, show the reason or put it on the desktop).
Only the header changes: the payload and its SHA-256 stay the same, and build_launcher copies the
header into the next version. A launcher that already has it is left alone. Headers must stay
ASCII (build_launcher decodes them as ascii); the cmd part must not contain a double quote or %.
"""
import sys
from pathlib import Path

MARK = 'QP_FAIL_REPORT'
NAME = 'TETRIO-patch-update-error.txt'

# sh: the launcher runs itself again with QPF_WRAP set and its output teed to a log.
SH = r'''# QP_FAIL_REPORT: on failure the output is saved to the Desktop (NAME)
if [ -z "${QPF_WRAP:-}" ]; then
  QPF_WRAP=1; export QPF_WRAP
  QPF_LOG=$(mktemp "${TMPDIR:-/tmp}/tetrio-patch-log.XXXXXXXX")
  set +e
  { /bin/sh "$0" "$@" 2>&1; echo "$?" > "$QPF_LOG.code"; } | tee "$QPF_LOG"
  QPF_CODE=$(cat "$QPF_LOG.code" 2>/dev/null || echo 1)
  if [ "$QPF_CODE" != 0 ]; then
    QPF_DESK=$(xdg-user-dir DESKTOP 2>/dev/null || true)
    [ -n "$QPF_DESK" ] && [ -d "$QPF_DESK" ] || QPF_DESK="${HOME:-/tmp}/Desktop"
    [ -d "$QPF_DESK" ] || QPF_DESK="${HOME:-/tmp}"
    QPF_OUT="$QPF_DESK/NAME"
    if { echo "TETR.IO patch update failed"; echo "launcher: $0"; echo "exit: $QPF_CODE"; date; uname -a; echo "----"; cat "$QPF_LOG"; } > "$QPF_OUT" 2>/dev/null; then
      echo "Update failed (exit $QPF_CODE). The reason was saved to: $QPF_OUT" >&2
    else
      echo "Update failed (exit $QPF_CODE)." >&2
    fi
  fi
  rm -f "$QPF_LOG" "$QPF_LOG.code"
  exit "$QPF_CODE"
fi
'''.replace('NAME', NAME)

# cmd: the PowerShell body is wrapped in try/catch, start.ps1's output is teed to a log.
CMD_HEAD = "$ErrorActionPreference='Stop';"
CMD_INIT = ("$qpfLog=Join-Path ([IO.Path]::GetTempPath()) ('tetrio-patch-log-'+[guid]::NewGuid().ToString('N')+'.txt');"
            "$qpfCode=1;try{")
CMD_RUN_OLD = "--kind {k};$code=$LASTEXITCODE;exit $code}}finally{{"
CMD_RUN_NEW = "--kind {k} *>&1 | Tee-Object -FilePath $qpfLog;$qpfCode=$LASTEXITCODE}}finally{{"
CMD_TAIL_OLD = "-ErrorAction SilentlyContinue}}"
CMD_TAIL_NEW = ("-ErrorAction SilentlyContinue}}}catch{$qpfCode=1;$m=($_|Out-String);Write-Host $m;"
                "Add-Content -LiteralPath $qpfLog -Value $m -Encoding UTF8 -ErrorAction SilentlyContinue};"
                "if($qpfCode -ne 0){$f=Join-Path ([Environment]::GetFolderPath('Desktop')) 'NAME';"
                "try{$t=@('TETR.IO patch update failed',('launcher: '+$self),('exit: '+$qpfCode),(Get-Date).ToString('s'),"
                "[Environment]::OSVersion.VersionString,'----');if(Test-Path -LiteralPath $qpfLog){$t+=Get-Content -LiteralPath $qpfLog};"
                "Set-Content -LiteralPath $f -Value $t -Encoding UTF8;Write-Host ('Update failed (exit '+$qpfCode+'). The reason was saved to: '+$f)}"
                "catch{Write-Host ('Update failed (exit '+$qpfCode+').')}};"
                "Remove-Item -LiteralPath $qpfLog -Force -ErrorAction SilentlyContinue;exit $qpfCode").replace('NAME', NAME)
# the comment line goes before the PowerShell call (cmd 'rem')
CMD_REM = 'rem QP_FAIL_REPORT: on failure the output is saved to the Desktop (' + NAME + ')'


def patch(path):
    raw = path.read_bytes()
    cmd = path.suffix == '.cmd'
    # with its line end: the cmd header names the marker too (IndexOf in the PowerShell line)
    begin = b':: QP_PAYLOAD_BEGIN\r\n' if cmd else b'# QP_PAYLOAD_BEGIN\n'
    i = raw.find(begin)
    if i < 0 or raw.count(begin) != 1:
        raise SystemExit('payload marker not found in ' + path.name)
    header = raw[:i].decode('ascii')
    if MARK in header:
        print('already', path.name)
        return
    if cmd:
        kind = path.name.split('-v')[1][0]
        run_old, run_new = CMD_RUN_OLD.format(k=kind), CMD_RUN_NEW.format(k=kind)
        for old in (CMD_HEAD, run_old, CMD_TAIL_OLD):
            if header.count(old) != 1:
                raise SystemExit(f'cmd part not found once in {path.name}: {old}')
        header = header.replace(CMD_HEAD, CMD_HEAD + CMD_INIT).replace(run_old, run_new).replace(CMD_TAIL_OLD, CMD_TAIL_NEW)
        header = header.replace('powershell.exe ', CMD_REM + '\r\npowershell.exe ', 1)
        body = header.split('-Command "', 1)[1].rsplit('"', 1)[0]
        if '"' in body or '%' in body:
            raise SystemExit('quote or % inside the PowerShell command of ' + path.name)
    else:
        if header.count('set -eu\n') != 1:
            raise SystemExit('set -eu not found once in ' + path.name)
        header = header.replace('set -eu\n', 'set -eu\n' + SH, 1)
    header.encode('ascii')
    mode = path.stat().st_mode & 0o777
    path.write_bytes(header.encode('ascii') + raw[i:])
    path.chmod(mode)
    print('added', path.name)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for a in sys.argv[1:]:
        patch(Path(a))
