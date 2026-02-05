exports.up = async function up(knex) {
  await knex.schema.alterTable("billing_settings", (table) => {
    table.text("openai_model");
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("billing_settings", (table) => {
    table.dropColumn("openai_model");
  });
};
