import { useEffect, useMemo, useState } from 'react';
import { FileText, Printer, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { auth } from '../lib/firebase';
import { subscribeToCollection, SEED_SCHOOLS } from '../lib/firebaseService';
import { isSchoolVisible, getActiveSuperintendentId } from '../lib/superintendentService';
import { listClassroomsForSchool, getActiveClassroomCount } from '../lib/classService';
import {
  montarRelatorioCarteira,
  detectarMetaSuspeita,
  formatarDataRelatorio,
  type SchoolLike,
} from '../lib/relatorioCarteira';
import PageHeader from './ui/PageHeader';
import SurfaceCard from './ui/SurfaceCard';

// Relatório da Carteira — gerado a partir dos dados reais da coleção
// `schools` no Firestore, filtrados pelo escopo do superintendente ativo.
//
// A versão anterior desta tela era uma simulação: exibia mensagens de
// progresso fabricadas com setTimeout ("compressão JPEG 0.75", "chunks
// assíncronos liberando ciclos da CPU") e não lia nenhum dado nem produzia
// arquivo algum. Nada dela foi reaproveitado.
//
// A exportação usa window.print() com uma folha de estilo de impressão, em
// vez de jsPDF/html2canvas: não acrescenta dependência ao bundle, o navegador
// já oferece "Salvar como PDF" no próprio diálogo, e o resultado é texto
// selecionável em vez de imagem rasterizada.

export default function RelatoriosView() {
  const [schools, setSchools] = useState<SchoolLike[]>(SEED_SCHOOLS as any);
  const [turmasPorEscola, setTurmasPorEscola] = useState<Record<string, number>>({});
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [carregandoTurmas, setCarregandoTurmas] = useState(false);
  const [erroTurmas, setErroTurmas] = useState<string | null>(null);
  const [, setActiveSuperId] = useState(getActiveSuperintendentId());

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => setIsFirebaseMode(!!user));
    return () => unsub();
  }, []);

  // Reage à troca de superintendente/escopo igual às demais telas, senão o
  // relatório continuaria mostrando a carteira anterior depois da troca.
  useEffect(() => {
    const handler = () => setActiveSuperId(getActiveSuperintendentId());
    window.addEventListener('sefor3_active_superintendent_change', handler);
    window.addEventListener('sefor3_admin_scope_change', handler);
    window.addEventListener('sefor3_filter_change', handler);
    return () => {
      window.removeEventListener('sefor3_active_superintendent_change', handler);
      window.removeEventListener('sefor3_admin_scope_change', handler);
      window.removeEventListener('sefor3_filter_change', handler);
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseMode) {
      setSchools(SEED_SCHOOLS as any);
      return;
    }
    const unsub = subscribeToCollection('schools', (loaded) => {
      if (loaded.length > 0) setSchools(loaded as any);
    });
    return () => unsub();
  }, [isFirebaseMode]);

  const visiveis = useMemo(
    () => schools.filter((s) => isSchoolVisible(s.nome)),
    [schools]
  );

  // Contagem de turmas ativas por escola. Uma escola só entra no mapa se a
  // consulta dela tiver sucesso — ausência de chave significa "não sei",
  // e o relatório mostra isso como pendência em vez de exibir zero.
  useEffect(() => {
    if (!isFirebaseMode || visiveis.length === 0) {
      setTurmasPorEscola({});
      return;
    }
    let cancelado = false;
    setCarregandoTurmas(true);
    setErroTurmas(null);

    (async () => {
      const mapa: Record<string, number> = {};
      let falhas = 0;
      for (const escola of visiveis) {
        try {
          const turmas = await listClassroomsForSchool(escola.id);
          mapa[escola.id] = getActiveClassroomCount(turmas);
        } catch {
          falhas += 1;
        }
      }
      if (cancelado) return;
      setTurmasPorEscola(mapa);
      setCarregandoTurmas(false);
      if (falhas > 0) {
        setErroTurmas(
          `Não foi possível ler as turmas de ${falhas} unidade(s). Essas unidades aparecem sem contagem de turmas.`
        );
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [isFirebaseMode, visiveis]);

  const relatorio = useMemo(
    () => montarRelatorioCarteira(visiveis, turmasPorEscola),
    [visiveis, turmasPorEscola]
  );

  const metaIdebSuspeita = useMemo(
    () => detectarMetaSuspeita(relatorio.linhas, 'metaIdeb'),
    [relatorio.linhas]
  );
  const metaSpaeceSuspeita = useMemo(
    () => detectarMetaSuspeita(relatorio.linhas, 'metaSpaece'),
    [relatorio.linhas]
  );

  const { resumo, linhas, pendencias } = relatorio;

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #relatorio-carteira, #relatorio-carteira * { visibility: visible !important; }
          #relatorio-carteira {
            position: absolute; left: 0; top: 0; width: 100%;
            padding: 0; margin: 0;
          }
          .nao-imprimir { display: none !important; }
          #relatorio-carteira table { page-break-inside: auto; }
          #relatorio-carteira tr { page-break-inside: avoid; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="nao-imprimir">
        <PageHeader
          eyebrow="SEFOR 3 — RELATÓRIO"
          title="Relatório da Carteira"
          description="Gerado a partir dos dados cadastrados no SIFEC para as unidades sob seu acompanhamento."
        />
      </div>

      <div className="nao-imprimir flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2.5 bg-brand-green hover:bg-brand-green-dark text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-sm transition flex items-center gap-2"
        >
          <Printer size={14} />
          Imprimir / Salvar em PDF
        </button>
        <span className="text-[11px] text-slate-500">
          No diálogo de impressão, escolha “Salvar como PDF” como destino.
        </span>
      </div>

      {!isFirebaseMode && (
        <div className="nao-imprimir flex items-start gap-2 p-3 rounded-xl bg-status-warn-bg border border-status-warn-border">
          <Info size={15} className="text-brand-orange-dark shrink-0 mt-0.5" />
          <p className="text-xs text-brand-orange-dark">
            Você não está autenticado. Este relatório mostra os dados de demonstração,
            não a carteira real. Entre com sua conta para gerar o relatório oficial.
          </p>
        </div>
      )}

      {erroTurmas && (
        <div className="nao-imprimir flex items-start gap-2 p-3 rounded-xl bg-status-warn-bg border border-status-warn-border">
          <AlertTriangle size={15} className="text-brand-orange-dark shrink-0 mt-0.5" />
          <p className="text-xs text-brand-orange-dark">{erroTurmas}</p>
        </div>
      )}

      {/* ---------- Conteúdo impresso ---------- */}
      <div id="relatorio-carteira" className="space-y-6">
        <header className="border-b border-slate-200 pb-4">
          <h1 className="text-lg font-extrabold text-slate-900">
            Relatório da Carteira — SEFOR 3 / CREDE 03
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Fonte: SIFEC — Sistema de Frequência e Indicadores Escolares ·
            Gerado em {formatarDataRelatorio(relatorio.geradoEm)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Dados agregados por unidade escolar. Nenhuma informação individual de
            estudante é apresentada.
          </p>
        </header>

        {/* Resumo */}
        <section>
          <h2 className="text-sm font-extrabold text-slate-900 mb-3">1. Panorama</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SurfaceCard className="p-3">
              <div className="text-label uppercase text-brand-green-dark">Unidades</div>
              <div className="text-xl font-extrabold text-slate-900">{resumo.totalUnidades}</div>
              <div className="text-[10px] text-slate-500">{resumo.unidadesAtivas} ativa(s)</div>
            </SurfaceCard>
            <SurfaceCard className="p-3">
              <div className="text-label uppercase text-brand-turquoise-dark">Matrículas</div>
              <div className="text-xl font-extrabold text-slate-900">
                {resumo.totalMatriculas.toLocaleString('pt-BR')}
              </div>
              <div className="text-[10px] text-slate-500">estudantes</div>
            </SurfaceCard>
            <SurfaceCard className="p-3">
              <div className="text-label uppercase text-brand-orange-dark">Turmas ativas</div>
              <div className="text-xl font-extrabold text-slate-900">
                {carregandoTurmas ? '…' : resumo.totalTurmas}
              </div>
              <div className="text-[10px] text-slate-500">
                {resumo.mediaPorTurmaCarteira !== null
                  ? `${resumo.mediaPorTurmaCarteira} por turma`
                  : 'sem base para média'}
              </div>
            </SurfaceCard>
            <SurfaceCard className="p-3">
              <div className="text-label uppercase text-slate-500">Cobertura de região</div>
              <div className="text-xl font-extrabold text-slate-900">
                4ª: {resumo.unidadesPorRegiao.quarta} · 5ª: {resumo.unidadesPorRegiao.quinta}
              </div>
              <div className="text-[10px] text-slate-500">
                {resumo.unidadesPorRegiao.naoInformada > 0
                  ? `${resumo.unidadesPorRegiao.naoInformada} sem região`
                  : 'todas informadas'}
              </div>
            </SurfaceCard>
          </div>

          {resumo.maiorUnidade && resumo.menorUnidade && resumo.totalUnidades > 1 && (
            <p className="text-xs text-slate-600 mt-3">
              Maior unidade: <strong>{resumo.maiorUnidade.nome}</strong> com{' '}
              {resumo.maiorUnidade.matriculas.toLocaleString('pt-BR')} estudantes.
              Menor: <strong>{resumo.menorUnidade.nome}</strong> com{' '}
              {resumo.menorUnidade.matriculas.toLocaleString('pt-BR')}.
              Cidade(s) de atuação: {resumo.cidades.join(', ')}.
            </p>
          )}
        </section>

        {/* Tabela */}
        <section>
          <h2 className="text-sm font-extrabold text-slate-900 mb-3">
            2. Unidades da carteira
          </h2>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left">
                <tr className="text-[10px] uppercase text-slate-500">
                  <th className="px-3 py-2 font-black">INEP</th>
                  <th className="px-3 py-2 font-black">Unidade escolar</th>
                  <th className="px-3 py-2 font-black">Região</th>
                  <th className="px-3 py-2 font-black text-right">Matrículas</th>
                  <th className="px-3 py-2 font-black text-right">Turmas</th>
                  <th className="px-3 py-2 font-black text-right">Por turma</th>
                  <th className="px-3 py-2 font-black text-right">Meta SPAECE</th>
                  <th className="px-3 py-2 font-black text-right">Meta IDEB</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.codInep} className="border-t border-slate-150">
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{l.codInep}</td>
                    <td className="px-3 py-2 font-bold text-slate-800">{l.nome}</td>
                    <td className="px-3 py-2 text-slate-600">{l.regiao}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {l.matriculas.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {l.turmas === null ? <span className="text-slate-400">—</span> : l.turmas}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {l.mediaPorTurma === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        l.mediaPorTurma
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{l.metaSpaece.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right font-mono">{l.metaIdeb.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr className="font-extrabold">
                  <td className="px-3 py-2" colSpan={3}>
                    Total — {resumo.totalUnidades} unidade(s)
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {resumo.totalMatriculas.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{resumo.totalTurmas}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {resumo.mediaPorTurmaCarteira ?? '—'}
                  </td>
                  <td className="px-3 py-2" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Pendências */}
        <section>
          <h2 className="text-sm font-extrabold text-slate-900 mb-3">
            3. Pendências de cadastro
          </h2>
          {pendencias.length === 0 ? (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-status-ok-bg border border-status-ok-border">
              <CheckCircle2 size={15} className="text-brand-green-dark shrink-0 mt-0.5" />
              <p className="text-xs text-brand-green-dark">
                Nenhuma pendência de cadastro nas unidades desta carteira.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left">
                  <tr className="text-[10px] uppercase text-slate-500">
                    <th className="px-3 py-2 font-black">Unidade</th>
                    <th className="px-3 py-2 font-black">Campo</th>
                    <th className="px-3 py-2 font-black">O que falta</th>
                  </tr>
                </thead>
                <tbody>
                  {pendencias.map((p, i) => (
                    <tr key={`${p.codInep}-${p.campo}-${i}`} className="border-t border-slate-150">
                      <td className="px-3 py-2 font-bold text-slate-800">{p.escola}</td>
                      <td className="px-3 py-2 text-slate-600">{p.campo}</td>
                      <td className="px-3 py-2 text-slate-600">{p.descricao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Limites */}
        <section>
          <h2 className="text-sm font-extrabold text-slate-900 mb-3">
            4. Limites deste relatório
          </h2>
          <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
            <li>
              Os números refletem o que está cadastrado no SIFEC nesta data, não a
              situação registrada no SIGE Escola. Divergências entre os dois sistemas
              não são detectadas aqui.
            </li>
            <li>
              Não há série histórica: todos os valores são de um único momento, então
              não é possível afirmar se um indicador melhorou ou piorou.
            </li>
            <li>
              Este relatório cobre o cadastro das unidades. Frequência, fluxo escolar,
              lançamento de notas e recomposição não entram nesta versão.
            </li>
            {metaIdebSuspeita && (
              <li>
                A Meta IDEB aparece como <strong>{metaIdebSuspeita.valor.toFixed(1)}</strong> em{' '}
                {metaIdebSuspeita.ocorrencias} das {linhas.length} unidades. Repetição
                nessa proporção costuma indicar valor padrão em vez de meta pactuada por
                unidade — vale conferir na fonte oficial.
              </li>
            )}
            {metaSpaeceSuspeita && (
              <li>
                A Meta SPAECE aparece como <strong>{metaSpaeceSuspeita.valor.toFixed(1)}</strong> em{' '}
                {metaSpaeceSuspeita.ocorrencias} das {linhas.length} unidades — mesma
                ressalva.
              </li>
            )}
          </ul>
        </section>

        <footer className="border-t border-slate-200 pt-3 flex items-center gap-2">
          <FileText size={13} className="text-slate-400" />
          <p className="text-[10px] text-slate-500">
            SIFEC — SEFOR 3 / CREDE 03 · Documento de uso interno para acompanhamento
            pedagógico. Não constitui ranqueamento de escolas.
          </p>
        </footer>
      </div>
    </div>
  );
}
