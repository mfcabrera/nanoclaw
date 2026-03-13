---
name: ynab
description: Manage YNAB budgets — triage uncategorized transactions, categorize expenses, check budget status, match Amazon.de purchases, and import Amazon order history. Use whenever the user asks about expenses, budgets, transactions, or financial categorization.
allowed-tools: Bash(curl:*), Bash(cat:*), Bash(python3:*), Bash(jq:*)
---

# YNAB Budget Management

## Budgets

| Budget | ID | When to use |
|--------|----|-------------|
| Personal Budget | `05c85d2b-0457-4151-8c22-65354eb63b02` | "my budget", "personal" |
| Budget Familiar | `705a12d3-226e-4136-97e8-cb4e6f7d246d` | "familiar", "family", "household" |

Ignore "Ori's Budget". When ambiguous, ask which budget.

Budget IDs are also cached in `/workspace/group/budgets.json`.

## YNAB REST API

Base URL: `https://api.youneedabudget.com/v1`
Auth: `Bearer $YNAB_API_TOKEN` (environment variable, already set).

### Currency — Milliunits

YNAB stores amounts in 1/1000 of the currency unit.
- Display: `amount / 1000` with 2 decimal places
- `45.67 EUR` = `45670` milliunits
- `-12.30 EUR` = `-12300` milliunits

### Endpoints

```bash
# List budgets
curl -s -H "Authorization: Bearer $YNAB_API_TOKEN" \
  "https://api.youneedabudget.com/v1/budgets"

# Budget details (accounts, categories, payees)
curl -s -H "Authorization: Bearer $YNAB_API_TOKEN" \
  "https://api.youneedabudget.com/v1/budgets/{budget_id}"

# Categories
curl -s -H "Authorization: Bearer $YNAB_API_TOKEN" \
  "https://api.youneedabudget.com/v1/budgets/{budget_id}/categories"

# Transactions (with date filter)
curl -s -H "Authorization: Bearer $YNAB_API_TOKEN" \
  "https://api.youneedabudget.com/v1/budgets/{budget_id}/transactions?since_date=2025-01-01"

# Uncategorized transactions
curl -s -H "Authorization: Bearer $YNAB_API_TOKEN" \
  "https://api.youneedabudget.com/v1/budgets/{budget_id}/transactions?since_date=2025-01-01&type=uncategorized"

# Update single transaction
curl -s -X PUT -H "Authorization: Bearer $YNAB_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.youneedabudget.com/v1/budgets/{budget_id}/transactions/{transaction_id}" \
  -d '{"transaction": {"category_id": "uuid-here", "memo": "optional memo"}}'

# Batch update (up to 500 transactions)
curl -s -X PATCH -H "Authorization: Bearer $YNAB_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.youneedabudget.com/v1/budgets/{budget_id}/transactions" \
  -d '{"transactions": [{"id": "tx-id", "category_id": "cat-id"}, ...]}'

# Payees
curl -s -H "Authorization: Bearer $YNAB_API_TOKEN" \
  "https://api.youneedabudget.com/v1/budgets/{budget_id}/payees"

# Current month budget
curl -s -H "Authorization: Bearer $YNAB_API_TOKEN" \
  "https://api.youneedabudget.com/v1/budgets/{budget_id}/months/current"
```

### Response Structure

All responses: `{"data": {...}}`
- Budgets: `data.budgets[]`
- Transactions: `data.transactions[]`
- Categories: `data.category_groups[].categories[]`

Transaction fields: `id`, `date`, `amount` (milliunits), `memo`, `payee_name`, `payee_id`, `category_id`, `category_name`, `account_name`, `cleared`, `approved`, `flag_color`

### Rate Limiting (200 req/hour)

- Cache categories and payees in local files
- Use `since_date` to limit transaction fetches
- Use batch PATCH instead of individual PUT
- Aim for <20 API calls per interaction

## Commands

### /ynab triage

Categorize uncategorized transactions.

1. Load `patterns.json` and category caches from `/workspace/group/`
2. If `categories-personal.json` doesn't exist, fetch and cache categories first
3. Fetch uncategorized transactions (last 30 days) from both budgets
4. For each transaction:
   - Check `patterns.json` for matching payee
   - Confidence >= 0.85 → auto-categorize
   - Otherwise → ask the user
5. Present grouped results:
   - *Auto-categorized*: payee, amount, assigned category
   - *Needs input*: payee, amount, suggested categories
6. After user confirms/corrects → batch-update YNAB
7. Update `patterns.json` with new/corrected mappings

When asking the user:
```
*REWE* - 45.67 EUR (Jan 15) [Personal]
Which category?
1. Groceries
2. Dining Out
3. Something else?
```

### /ynab budget

Show budget status for current month.

1. Fetch current month data for both budgets
2. Show categories with spending vs budgeted
3. Warn on categories over 90% spent

Format:
```
*Budget Alert*
- Dining Out: 187/200 EUR (93% spent, 15 days left)
- Entertainment: 95/100 EUR (95% spent)
```

### /ynab amazon

Match Amazon.de purchases to YNAB transactions.

The user has two Amazon.de accounts (own + wife's). Amazon transactions appear in YNAB with generic payees.

**Amazon payee patterns in YNAB:**
- `AMAZON.DE` / `Amazon.de`
- `AMZN Mktp DE` / `AMZN MKTP DE`
- `AMAZON EU S.a.r.l.`
- `AMZNPrime DE` (Prime subscription)
- `AMAZON MEDIA EU` (digital, Kindle)
- `Audible` (Audible subscription)

**Import Amazon orders:**

When user provides CSV from amazon.de/gp/b2b/reports or pastes order data:
1. Parse CSV — key fields: Order Date, Order ID, Title/Product Name, Total/Item Total
2. Save to `/workspace/group/amazon-orders.json`:
```json
{
  "orders": [
    {
      "order_id": "302-1234567-8901234",
      "order_date": "2026-02-15",
      "items": [{"title": "Pampers Size 5", "amount": 23.99, "amazon_category": "Baby"}],
      "total": 23.99,
      "account": "miguel",
      "matched_transaction_id": null
    }
  ],
  "last_import": "2026-02-28"
}
```
3. Immediately try to match against unmatched YNAB Amazon transactions

**Matching algorithm:**
1. Fetch YNAB transactions where payee contains "amazon" or "amzn" (case-insensitive)
2. Filter to uncategorized or unmatched
3. Match by: exact amount + date within 5 days + not already matched
4. One match → auto-match, set category based on product, add product title to memo
5. Multiple matches → ask user
6. No match → flag for manual review

**Manual entry:**
User can say: "I bought diapers on Amazon for 23.99" or "my wife ordered a book for 15.50 on Amazon yesterday"
→ Save with `account: "miguel"` or `account: "wife"` and attempt matching.

### /ynab summary

Spending summary and trends.

- Top spending categories this month
- Month-over-month comparison
- Unusual spending spikes (>2x average for category)
- Practical tips based on actual data

## Pattern Learning

Store in `/workspace/group/patterns.json`:

```json
{
  "patterns": [
    {
      "payee_contains": "REWE",
      "match_type": "contains",
      "category_name": "Groceries",
      "category_id": "uuid",
      "budget_id": "uuid",
      "confidence": 0.95,
      "times_matched": 12,
      "last_matched": "2025-01-15"
    }
  ]
}
```

Rules:
- New pattern → confidence 0.7
- Each additional match → +0.05 (cap at 1.0)
- User correction → reset to 0.7 with new category
- Match types: `exact` (full payee match) or `contains` (substring)
- Patterns are budget-specific (personal vs familiar may differ)

## Browser Automation for Amazon

If user wants to import Amazon orders via browser:

```bash
agent-browser open "https://www.amazon.de/gp/b2b/reports"
agent-browser snapshot -i
```

Always ask before logging into any account.
