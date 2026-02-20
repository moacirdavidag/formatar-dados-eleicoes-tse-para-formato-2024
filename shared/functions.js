export const texto = (valor) => {
  if (valor === null || valor === undefined) return null;
  const str = String(valor).toLowerCase();
  return str.replace(/(^|\s|-|\/)\p{L}/gu, (l) => l.toUpperCase());
};
