-- Revert 20261111110000_scoring_pool_builder_keep_ridden.sql.
--
-- Re-run supabase/migrations/20261111100000_scoring_pool_builder.sql: it puts
-- back the version of scoring_save_start_list that refuses once the round has
-- results. Start lists already saved stay as they are.
--
-- To remove the pool builder's function altogether instead, run
-- revert/20261111100000_scoring_pool_builder.revert.sql.

select 1;
