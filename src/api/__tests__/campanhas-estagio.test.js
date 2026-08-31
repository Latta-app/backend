// "Onde a campanha parou": o rótulo que o seletor mostra em cada linha.
//
// 🚨 O rotulo mora no BACKEND, junto das contagens que o alimentam. A primeira
// versao calculava no frontend e este teste o importava por caminho relativo
// entre os dois repos — o que passa nesta maquina e quebra no CI, onde o
// backend e clonado sozinho. Regra de dominio fica de um lado so.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 o estágio mostrando o degrau ERRADO. A lista é o único lugar que
//     responde "qual eu estava montando e em que pé ela está", e um rótulo que
//     erra o degrau faz o operador abrir a campanha errada — ou pior, achar que
//     uma campanha já enviada ainda está por enviar;
//   · 🚨 o alerta de peça quebrada SUBSTITUINDO o estágio em vez de acompanhar.
//     Uma campanha pode ter ido longe E ter peça falhada no caminho: mostrar só
//     a informação mais bonita esconde a que exige ação;
//   · contagem parcial virando total ("69 enviadas" quando saíram 3 de 69);
// NÃO PEGA:
//   · se o componente desenha bonito. Isso é o olho;
//   · o filtro por nome do seletor, que e da TELA e mora no frontend. O repo
//     de la nao tem suite, entao ele fica coberto pelo roteiro de teste manual.
import { describe, it, expect } from 'vitest';
import { ondeParou } from '../services/campaign-stage.service.js';

const campanha = (extra) => ({
  nome: 'Dia do Cachorro',
  audiencia_congelada: 0,
  pecas_prontas: 0,
  pecas_aprovadas: 0,
  pecas_com_erro: 0,
  enviadas: 0,
  direcao_aprovada: false,
  ...extra,
});

describe('🚨 o estágio é o degrau mais LONGE alcançado', () => {
  it('campanha nova é rascunho', () => {
    expect(ondeParou(campanha()).id).toBe('rascunho');
  });

  it('com público congelado, mostra os tutores', () => {
    const e = ondeParou(campanha({ audiencia_congelada: 69 }));
    expect(e.id).toBe('publico');
    expect(e.rotulo).toBe('69 tutores congelados');
  });

  it('com direção aprovada e nenhuma peça, DIZ que não tem peça', () => {
    const e = ondeParou(campanha({ audiencia_congelada: 69, direcao_aprovada: true }));
    expect(e.id).toBe('direcao');
    expect(e.rotulo).toMatch(/sem peças/);
  });

  it('com peças e nenhuma aprovada, DIZ que nenhuma foi aprovada', () => {
    const e = ondeParou(campanha({ audiencia_congelada: 69, direcao_aprovada: true, pecas_prontas: 69 }));
    expect(e.id).toBe('com_pecas');
    expect(e.rotulo).toBe('69 peças, nenhuma aprovada');
  });

  it('🚨 com peças aprovadas e nada enviado, DIZ que nada saiu', () => {
    // É o estado mais perigoso da lista: tudo pronto e ninguém avisado. O
    // rótulo tem que gritar isso, não dizer "69 aprovadas" e deixar no ar.
    const e = ondeParou(campanha({ pecas_prontas: 69, pecas_aprovadas: 69 }));
    expect(e.id).toBe('aprovada');
    expect(e.rotulo).toMatch(/nada enviado/);
  });

  it('enviada por inteiro mostra só o número', () => {
    expect(ondeParou(campanha({ pecas_aprovadas: 69, enviadas: 69 })).rotulo).toBe('69 enviadas');
  });

  it('🚨 enviada PELA METADE mostra a fração, e não o total', () => {
    // "69 enviadas" quando saíram 3 é a mentira mais cara da lista: o operador
    // fecha a campanha achando que acabou.
    expect(ondeParou(campanha({ pecas_aprovadas: 69, enviadas: 3 })).rotulo).toBe(
      '3 de 69 enviadas',
    );
  });

  it('o degrau mais longe vence os anteriores', () => {
    const e = ondeParou(
      campanha({ audiencia_congelada: 69, direcao_aprovada: true, pecas_prontas: 69, enviadas: 69, pecas_aprovadas: 69 }),
    );
    expect(e.id).toBe('enviada');
  });
});

describe('🚨 o alerta ACOMPANHA o estágio, nunca o substitui', () => {
  it('campanha que foi longe E tem peça quebrada mostra as duas coisas', () => {
    const e = ondeParou(campanha({ pecas_aprovadas: 60, enviadas: 60, pecas_com_erro: 9 }));
    expect(e.id).toBe('enviada');
    expect(e.alerta).toBe('9 peças falharam');
  });

  it('sem peça quebrada não inventa alerta', () => {
    expect(ondeParou(campanha({ enviadas: 1, pecas_aprovadas: 1 })).alerta).toBe(null);
  });
});
