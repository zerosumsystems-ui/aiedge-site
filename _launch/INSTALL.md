# Activating the live-bars aggregator

First run the entitlement probe during market hours:

```bash
python3 scripts/probe_databento_entitlements.py
```

Use the result to set `.env.local` before installing the launchd job:

```bash
LIVE_DATASET=EQUS.MINI

# Prefer native Databento bars when the probe shows this streams during RTH.
LIVE_SCHEMA=ohlcv-1m

# Fall back to local tick aggregation if trades streams and ohlcv-1m does not.
# LIVE_SCHEMA=trades
```

Then install the launchd job:

```bash
# Copy the plist into LaunchAgents
cp _launch/com.aiedge.live-bars.plist ~/Library/LaunchAgents/

# Load + start it (-w marks it auto-enabled across reboots)
launchctl load -w ~/Library/LaunchAgents/com.aiedge.live-bars.plist

# Verify it started + is writing the log
tail -f ~/Library/Logs/aiedge-live-bars.out.log
# Expect lines like:
#   [SPY] 1747000020  o=580.12 h=580.21 l=580.10 c=580.18 v=12345
```

To pause without uninstalling:

```bash
launchctl stop com.aiedge.live-bars
```

To stop AND remove from auto-start:

```bash
launchctl unload -w ~/Library/LaunchAgents/com.aiedge.live-bars.plist
```

Status check:

```bash
launchctl list | grep aiedge.live-bars
# PID column = 0 means not running, a number means running, "-" means waiting
```
