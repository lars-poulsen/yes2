exports.up = async function up(knex) {
  await knex.schema.table("users", (table) => {
    table.timestamp("blocked_at", { useTz: true }).nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.table("users", (table) => {
    table.dropColumn("blocked_at");
  });
};
