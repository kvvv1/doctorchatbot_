
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function inspectSchema() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // We rely on the fact that if we can query the table, we can see its structure via selectivity
    // But wait, the previous script returned []. Let's try a direct RPC that maybe exists,
    // OR we can try to query information_schema if the service role has permissions.

    const { data, error } = await supabase.from('appointments').select('*').limit(1);

    if (error) {
        console.error('Error querying appointments:', error);
    } else {
        // If table is empty, we might not get keys from select '*'.
        // Let's try to insert a dummy record with a returning clause if possible? No, risky.
        // Let's try to query another table that might have data.
    }

    // Best way in Supabase without a custom RPC is to try to trigger a schema error by selecting a non-existent column
    // and see if the error message lists available columns (Postgres sometimes does this).
    // Actually, let's try to fetch one column at a time that we suspect might exist.

    const columnsToTry = ['id', 'clinic_id', 'patient_name', 'starts_at', 'ends_at', 'description', 'status', 'duration'];
    for (const col of columnsToTry) {
        const { error } = await supabase.from('appointments').select(col).limit(1);
        console.log(`Column ${col}: ${error ? 'MISSING (' + error.message + ')' : 'EXISTS'}`);
    }
}

inspectSchema();
