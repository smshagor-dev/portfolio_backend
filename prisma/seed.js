const fs = require("fs");
const path = require("path");
const { Prisma, PrismaClient } = require("@prisma/client");
const { toDelegateName } = require("../lib/next-id");

const prisma = new PrismaClient();
const sqlSeedPath = path.resolve(
  process.cwd(),
  process.env.SQL_SEED_FILE || "mybuddis_smshagor_portfolio.sql",
);
const chunkSize = 250;

function buildModelMaps() {
  const tableToModel = new Map();
  const fieldMaps = new Map();

  for (const model of Prisma.dmmf.datamodel.models) {
    const tableName = model.dbName || model.name;
    tableToModel.set(tableName, model);
    const modelFieldMap = new Map();
    for (const field of model.fields) {
      modelFieldMap.set(field.name, field);
      if (field.dbName) {
        modelFieldMap.set(field.dbName, field);
      }
    }
    fieldMaps.set(model.name, modelFieldMap);
  }

  return { tableToModel, fieldMaps };
}

function extractInsertStatements(sql) {
  const statements = [];
  let cursor = 0;

  while (cursor < sql.length) {
    const start = sql.indexOf("INSERT INTO `", cursor);
    if (start === -1) {
      break;
    }

    let index = start;
    let inString = false;
    let escaped = false;

    while (index < sql.length) {
      const char = sql[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "'") {
          if (sql[index + 1] === "'") {
            index += 1;
          } else {
            inString = false;
          }
        }
        index += 1;
        continue;
      }

      if (char === "'") {
        inString = true;
        index += 1;
        continue;
      }

      if (char === ";") {
        statements.push(sql.slice(start, index + 1));
        cursor = index + 1;
        break;
      }

      index += 1;
    }

    if (index >= sql.length) {
      cursor = sql.length;
    }
  }

  return statements;
}

function splitRows(rawValues) {
  const rows = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const char of rawValues) {
    if (inString) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }

    if (char === "'") {
      if (depth > 0) {
        current += char;
      }
      inString = true;
      continue;
    }

    if (char === "(") {
      current += char;
      depth += 1;
      continue;
    }

    if (char === ")") {
      current += char;
      depth -= 1;
      if (depth === 0) {
        rows.push(current.trim().replace(/,$/, ""));
        current = "";
      }
      continue;
    }

    if (depth > 0) {
      current += char;
    }
  }

  return rows;
}

function parseRow(rowText) {
  const body = rowText.trim().replace(/^\(/, "").replace(/\)$/, "");
  const values = [];
  let current = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];

    if (inString) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "'") {
        if (body[index + 1] === "'") {
          current += "'";
          index += 1;
          continue;
        }

        inString = false;
        continue;
      }

      current += char;
      continue;
    }

    if (char === "'") {
      inString = true;
      continue;
    }

    if (char === ",") {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map((value) => {
    if (value.toUpperCase() === "NULL") {
      return null;
    }

    return value;
  });
}

function parseJsonValue(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function convertValue(field, rawValue) {
  if (rawValue == null) {
    return null;
  }

  switch (field.type) {
    case "Int":
      return Number.parseInt(rawValue, 10);
    case "Float":
      return Number.parseFloat(rawValue);
    case "Boolean":
      return rawValue === "1" || String(rawValue).toLowerCase() === "true";
    case "DateTime":
      return new Date(rawValue);
    case "Json":
      return parseJsonValue(rawValue, Array.isArray(field.default) ? [] : null);
    default:
      return rawValue;
  }
}

async function clearCollections() {
  const models = [...Prisma.dmmf.datamodel.models].reverse();

  for (const model of models) {
    const delegate = prisma[toDelegateName(model.name)];
    if (delegate && typeof delegate.deleteMany === "function") {
      await delegate.deleteMany();
    }
  }
}

async function insertRows(model, rows) {
  const delegate = prisma[toDelegateName(model.name)];
  if (!delegate || typeof delegate.createMany !== "function" || rows.length === 0) {
    return;
  }

  for (let index = 0; index < rows.length; index += chunkSize) {
    await delegate.createMany({
      data: rows.slice(index, index + chunkSize),
    });
  }
}

async function importSqlSeed() {
  if (!fs.existsSync(sqlSeedPath)) {
    throw new Error(`SQL seed file not found at ${sqlSeedPath}`);
  }

  const sql = fs.readFileSync(sqlSeedPath, "utf8");
  const { tableToModel, fieldMaps } = buildModelMaps();
  const rowsByModel = new Map();

  for (const statement of extractInsertStatements(sql)) {
    const match = statement.match(/^INSERT INTO `([^`]+)` \(([^)]+)\) VALUES\s*([\s\S]*);$/);
    if (!match) {
      continue;
    }

    const [, tableName, rawColumns, rawValues] = match;
    const model = tableToModel.get(tableName);
    if (!model) {
      continue;
    }

    const columns = rawColumns
      .split(",")
      .map((column) => column.trim().replace(/`/g, ""));
    const modelFieldMap = fieldMaps.get(model.name);
    const parsedRows = splitRows(rawValues).map((rowText) => {
      const rawRowValues = parseRow(rowText);
      const record = {};

      columns.forEach((columnName, columnIndex) => {
        const field = modelFieldMap.get(columnName);
        if (!field || field.kind === "object") {
          return;
        }

        const value = convertValue(field, rawRowValues[columnIndex]);
        if (value !== undefined) {
          record[field.name] = value;
        }
      });

      return record;
    });

    rowsByModel.set(model.name, (rowsByModel.get(model.name) || []).concat(parsedRows));
  }

  await clearCollections();

  for (const model of Prisma.dmmf.datamodel.models) {
    await insertRows(model, rowsByModel.get(model.name) || []);
  }
}

async function main() {
  await importSqlSeed();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
