# Claude Token Usage Monitoring - Research Findings

**Date:** December 2024
**Status:** Shelved - API access blocked

## Goal

Add a "Claude" tab to DevLaunch to monitor Claude API token usage and costs in real-time, similar to the existing System monitor tab.

## APIs Investigated

### 1. Claude Console Dashboard
- **URL:** console.anthropic.com
- **Finding:** Built-in UI shows usage/costs, but no API access
- **Useful for:** Manual checking, CSV export

### 2. Usage and Cost Admin API
- **Endpoint:** `/v1/organizations/usage_report/messages`
- **Features:** Token usage by model, workspace, API key. Aggregation intervals: 1m, 1h, 1d
- **Docs:** https://platform.claude.com/docs/en/build-with-claude/usage-cost-api
- **Requires:** Admin API key (`sk-ant-admin...`)

### 3. Claude Code Analytics API
- **Features:** Tool usage metrics, cost analysis by model
- **Limitation:** Up to 1-hour delay on metrics
- **Docs:** https://docs.claude.com/en/api/claude-code-analytics-api

### 4. Third-Party Integrations
- **Grafana Cloud:** Pre-built dashboard + alerts
- **Datadog:** Pre-built Anthropic dashboard with usage by model/workspace

## The Blocker

The Admin API is the only way to programmatically access usage data, but:

1. Requires a special Admin API key starting with `sk-ant-admin...`
2. Regular API keys (`sk-ant-api...`) don't work for usage endpoints
3. Admin keys are created at: console.anthropic.com/settings/admin-keys
4. **"The Admin API is unavailable for individual accounts"** - per Anthropic docs
5. Even with an "Individual Org" set up, Admin Keys section may not be accessible

## What We Wanted to Build

- New "Claude" tab in DevLaunch (alongside Logs, Ports, System)
- Real-time polling with toggle to disable
- Token usage (input/output) over time
- Cost breakdown by model (Opus, Sonnet, Haiku)
- Current billing period spend
- Rate limit status

## Status

**Shelved** - The Admin API key requirement makes this inaccessible for personal/individual accounts.

## Future Options

1. **Wait for Anthropic** to make usage API available to individual accounts
2. **Client-side token counting** - Use `@anthropic-ai/sdk` countTokens() to estimate usage locally (less accurate, no cost data)
3. **Parse Claude Code logs** - Extract usage from local CLI logs (hacky, incomplete)

## References

- Admin API docs: https://docs.claude.com/en/api/administration-api
- Usage API docs: https://platform.claude.com/docs/en/build-with-claude/usage-cost-api
- Admin keys: console.anthropic.com/settings/admin-keys
