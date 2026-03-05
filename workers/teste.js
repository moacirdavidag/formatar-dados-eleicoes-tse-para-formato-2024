const ts = numero(detalhe.QT_TOTAL_SECOES);
    const st = ts;
    const snt = 0;
    const si = ts - numero(detalhe.QT_SECOES_NAO_INSTALADAS);
    const sni = numero(detalhe.QT_SECOES_NAO_INSTALADAS);
    const sa = si;
    const sna = 0;

    const pst = percentual(st, ts);
    const psnt = percentual(snt, ts);
    const psi = percentual(si, ts);
    const psni = percentual(sni, ts);
    const psa = percentual(sa, si);
    const psna = percentual(sna, si);

s: {
    ts: String(ts),
    st: String(st),
    pst: formatPct(pst),
    pstn: formatPctN(pst),
    snt: String(snt),
    psnt: formatPct(psnt),
    psntn: formatPctN(psnt),
    si: String(si),
    psi: formatPct(psi),
    psin: formatPctN(psi),
    sni: String(sni),
    psni: formatPct(psni),
    psnin: formatPctN(psni),
    sa: String(sa),
    psa: formatPct(psa),
    psan: formatPctN(psa),
    sna: String(sna),
    psna: formatPct(psna),
    psnan: formatPctN(psna),
  },