CREATE TABLE IF NOT EXISTS "users" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT,
  "password" TEXT
);

CREATE TABLE IF NOT EXISTS "backtests" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER,
  "timeframe_id" INTEGER,
  "ROI" DECIMAL,
  "length" INTEGER,
  "lookback" DECIMAL,
  "std_dev" DECIMAL,
  "front_vector" DECIMAL,
  "middle_vector" DECIMAL,
  "back_vector" DECIMAL,
  "created_timestamp" TEXT,
  "starting_balance" DECIMAL,
  "ending_balance" DECIMAL
);

CREATE TABLE IF NOT EXISTS "backtest_cumret_timeseries" (
  "id" SERIAL PRIMARY KEY,
  "backtest_id" INTEGER,
  "timestamp" TEXT,
  "cumret" DECIMAL
);

CREATE TABLE IF NOT EXISTS "instruments" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT
);

CREATE TABLE IF NOT EXISTS "backtests_instruments" (
  "id" SERIAL PRIMARY KEY,
  "backtest_id" INTEGER,
  "instrument_id" INTEGER
);

CREATE TABLE IF NOT EXISTS "timeframes" (
  "id" SERIAL PRIMARY KEY,
  "timeframe" TEXT
);