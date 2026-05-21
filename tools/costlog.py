"""Append Anthropic API call cost to data/cost-ledger.jsonl.

Imported by frame-qa.py and clip-qa.py. log_call() never raises — cost
logging must never break a QA run. Reconcile the ledger with tools/cost-report.cjs.
"""
import datetime
import json
import os

# USD per million tokens: (input, output, cache_write_5m, cache_read)
_PRICING = {
    "opus": (15.0, 75.0, 18.75, 1.50),
    "sonnet": (3.0, 15.0, 3.75, 0.30),
    "haiku": (1.0, 5.0, 1.25, 0.10),
}

_LEDGER = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "cost-ledger.jsonl"
)


def _rate(model: str):
    m = (model or "").lower()
    for key, val in _PRICING.items():
        if key in m:
            return val
    return _PRICING["opus"]  # unknown model -> assume most expensive


def cost_for(model: str, usage: dict) -> float:
    inp = usage.get("input_tokens", 0) or 0
    out = usage.get("output_tokens", 0) or 0
    cw = usage.get("cache_creation_input_tokens", 0) or 0
    cr = usage.get("cache_read_input_tokens", 0) or 0
    pi, po, pcw, pcr = _rate(model)
    return round((inp * pi + out * po + cw * pcw + cr * pcr) / 1_000_000, 6)


def log_call(tool: str, response: dict, target: str = "") -> float:
    """Append one cost record. `response` is the full Anthropic /v1/messages JSON.
    Returns the computed cost (0.0 on any failure). Never raises."""
    try:
        usage = response.get("usage", {}) or {}
        model = response.get("model", "") or ""
        cost = cost_for(model, usage)
        rec = {
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "tool": tool,
            "model": model,
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
            "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
            "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
            "cost_usd": cost,
            "target": os.path.basename(target) if target else "",
        }
        os.makedirs(os.path.dirname(_LEDGER), exist_ok=True)
        with open(_LEDGER, "a") as fh:
            fh.write(json.dumps(rec) + "\n")
        return cost
    except Exception:
        return 0.0
