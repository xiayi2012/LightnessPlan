function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function unit() {
  return wx.getStorageSync("weightUnit") || "kg";
}

function kg(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const currentUnit = unit();
  return currentUnit === "jin" ? `${(Number(value) * 2).toFixed(1)}斤` : `${Number(value).toFixed(1)}kg`;
}

function signedKg(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const currentUnit = unit();
  const number = Number(value);
  const display = currentUnit === "jin" ? Math.abs(number * 2) : Math.abs(number);
  return `${number > 0 ? "-" : number < 0 ? "+" : ""}${display.toFixed(1)}${currentUnit === "jin" ? "斤" : "kg"}`;
}

function inputToKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return number;
  return unit() === "jin" ? Number((number / 2).toFixed(2)) : number;
}

function kgToInput(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return unit() === "jin" ? Number((number * 2).toFixed(1)) : Number(number.toFixed(1));
}

module.exports = { today, kg, signedKg, inputToKg, kgToInput, unit };
