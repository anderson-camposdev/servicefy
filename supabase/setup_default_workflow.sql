UPDATE case_types 
SET workflow_config = '{
  "states": ["New", "In Progress", "On Hold", "Resolved", "Closed", "Canceled"],
  "transitions": [
    {"from": "New", "to": "In Progress"},
    {"from": "New", "to": "Canceled"},
    {"from": "In Progress", "to": "On Hold"},
    {"from": "In Progress", "to": "Resolved"},
    {"from": "On Hold", "to": "In Progress"},
    {"from": "Resolved", "to": "Closed"}
  ]
}'::jsonb, 
form_schema = '{
  "fields": [
    {"id": "urgency", "type": "select", "label": "Urgência", "required": true, "options": [{"label":"Alta","value":"high"},{"label":"Média","value":"medium"},{"label":"Baixa","value":"low"}]},
    {"id": "impact", "type": "select", "label": "Impacto", "required": true, "options": [{"label":"Alta","value":"high"},{"label":"Média","value":"medium"},{"label":"Baixa","value":"low"}]}
  ]
}'::jsonb 
WHERE key = 'incident';
