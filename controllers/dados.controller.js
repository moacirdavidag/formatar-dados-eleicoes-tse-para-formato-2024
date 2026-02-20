export const renderDados = (req, res) => {
  const anosGerais = [1982, 1986, 1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022, 2026];
  const anosMunicipais = [1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024];

  const anos = {
    gerais: anosGerais,
    municipais: anosMunicipais
  };

  res.render("dados", { anos });
};