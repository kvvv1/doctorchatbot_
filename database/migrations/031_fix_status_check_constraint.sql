SELECT id, clinic_id, patient_phone, status, bot_state
FROM conversations
ORDER BY created_at DESC
LIMIT 10;