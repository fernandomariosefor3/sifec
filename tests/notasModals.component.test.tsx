// @vitest-environment jsdom
// Fase 2C — testes de componente dos dois modais do painel de Notas
// Bimestrais em isolamento: StudentRegistrationModal (cadastro manual,
// seção 13 do plano) e StudentBimesterGradeFormModal (preenchimento de
// notas, seção 14). Só firebase.ts (auth) e os dois serviços reais
// (studentRosterService/studentBimesterGradeService) são mockados — a
// orquestração de NotasView (seleção de escola, filtros, tabelas) é
// coberta em tests/notasView.component.test.tsx.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import StudentRegistrationModal from '../src/components/notas/StudentRegistrationModal';
import StudentBimesterGradeFormModal from '../src/components/notas/StudentBimesterGradeFormModal';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { mockAuth, mockSaveRoster, mockSaveGrade } = vi.hoisted(() => ({
  mockAuth: { currentUser: { email: 'super.a@example.com' } as { email: string } | null },
  mockSaveRoster: vi.fn(),
  mockSaveGrade: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({ auth: mockAuth }));

vi.mock('../src/lib/studentRosterService', () => ({
  saveStudentRosterEntry: (...args: unknown[]) => mockSaveRoster(...args),
  StudentRosterValidationError: class extends Error {},
}));

vi.mock('../src/lib/studentBimesterGradeService', () => ({
  saveStudentBimesterGrade: (...args: unknown[]) => mockSaveGrade(...args),
  StudentBimesterGradeValidationError: class extends Error {},
}));

const SCHOOL = { id: 'diva-cabral', nome: 'EEM Diva Cabral', codInep: '23067918' };
const TURMAS = [
  { id: 'turma-3a-diva', nome: '3º Ano A - Matutino' } as unknown as import('../src/types/classroom').Turma,
  { id: 'turma-3b-diva', nome: '3º Ano B - Vespertino' } as unknown as import('../src/types/classroom').Turma,
];

describe('StudentRegistrationModal', () => {
  beforeEach(() => {
    mockAuth.currentUser = { email: 'super.a@example.com' };
  });

  function renderRegistration(overrides: Partial<Parameters<typeof StudentRegistrationModal>[0]> = {}) {
    return render(
      <StudentRegistrationModal
        school={SCHOOL}
        turmas={TURMAS}
        anoLetivo={2026}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        {...overrides}
      />
    );
  }

  it('mostra o aviso de privacidade antes de salvar', () => {
    renderRegistration();
    expect(screen.getByText('Cadastre somente as informações necessárias ao acompanhamento pedagógico.')).toBeInTheDocument();
  });

  it('não mostra nenhum botão de exclusão comum', () => {
    renderRegistration();
    expect(screen.queryByText(/Excluir/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
  });

  // Revisão do PR #15, item 7: nunca escolher a primeira turma da lista
  // automaticamente — só usar defaultTurmaId quando ele existir de fato.
  it('sem defaultTurmaId, o select de turma começa em "Selecione" (nunca a primeira da lista)', () => {
    renderRegistration();
    const select = screen.getByLabelText('Turma *') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('defaultTurmaId válido (presente na lista recebida) é aceito', () => {
    renderRegistration({ defaultTurmaId: 'turma-3b-diva' });
    const select = screen.getByLabelText('Turma *') as HTMLSelectElement;
    expect(select.value).toBe('turma-3b-diva');
  });

  it('defaultTurmaId inexistente na lista recebida é ignorado (nunca cai para a primeira turma)', () => {
    renderRegistration({ defaultTurmaId: 'turma-que-nao-existe' });
    const select = screen.getByLabelText('Turma *') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('envio sem seleção de turma é bloqueado, com mensagem clara, e o serviço nunca é chamado', async () => {
    renderRegistration();
    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Estudante Sem Turma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar estudante' }));

    await waitFor(() => expect(screen.getByText('Selecione uma turma.')).toBeInTheDocument());
    expect(mockSaveRoster).not.toHaveBeenCalled();
  });

  it('cadastro manual gera studentKey via crypto.randomUUID (nunca a partir do nome) e chama o serviço', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
    mockSaveRoster.mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderRegistration({ onSaved, onClose });

    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Estudante Novo' } });
    fireEvent.change(screen.getByLabelText('Turma *'), { target: { value: 'turma-3b-diva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar estudante' }));

    await waitFor(() => expect(mockSaveRoster).toHaveBeenCalledTimes(1));
    expect(mockSaveRoster.mock.calls[0][0]).toMatchObject({
      studentKey: '11111111-1111-4111-8111-111111111111',
      schoolId: 'diva-cabral',
      codInep: '23067918',
      escolaNome: 'EEM Diva Cabral',
      turmaId: 'turma-3b-diva',
      turmaNome: '3º Ano B - Vespertino',
      anoLetivo: 2026,
      studentName: 'Estudante Novo',
      active: true,
      actingUserEmail: 'super.a@example.com',
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('erro de validação do serviço fica visível e onSaved NÃO é chamado (sem gravação parcial)', async () => {
    const { StudentRosterValidationError } = await import('../src/lib/studentRosterService');
    mockSaveRoster.mockRejectedValueOnce(new StudentRosterValidationError('Nome inválido.'));
    const onSaved = vi.fn();
    renderRegistration({ onSaved });

    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Turma *'), { target: { value: 'turma-3a-diva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar estudante' }));

    await waitFor(() => expect(screen.getByText('Nome inválido.')).toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('StudentBimesterGradeFormModal', () => {
  beforeEach(() => {
    mockAuth.currentUser = { email: 'super.a@example.com' };
  });

  function renderGradeForm(overrides: Partial<Parameters<typeof StudentBimesterGradeFormModal>[0]> = {}) {
    return render(
      <StudentBimesterGradeFormModal
        school={SCHOOL}
        turmaId="turma-3a-diva"
        turmaNome="3º Ano A - Matutino"
        anoLetivo={2026}
        bimestre={1}
        studentKey="aluno-1"
        studentName="Estudante Um"
        existingScores={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        {...overrides}
      />
    );
  }

  function subjectInput(label: string) {
    return screen.getByLabelText(label) as HTMLInputElement;
  }

  it('não mostra nenhum botão de exclusão comum', () => {
    renderGradeForm();
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
  });

  it('percentual/preenchidas/média mudam ao vivo conforme as notas são digitadas', async () => {
    renderGradeForm();
    expect(screen.getByText('0 de 4')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();

    fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '8' } });
    await waitFor(() => expect(screen.getByText('1 de 4')).toBeInTheDocument());
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('8.0')).toBeInTheDocument();
  });

  it('nota zero conta como preenchida (não como ausente)', async () => {
    renderGradeForm();
    fireEvent.change(subjectInput('Matemática'), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByText('1 de 4')).toBeInTheDocument());
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('aceita vírgula decimal e converte para número antes de enviar ao serviço', async () => {
    mockSaveGrade.mockResolvedValue(undefined);
    renderGradeForm();

    fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '8,5' } });
    fireEvent.change(subjectInput('Matemática'), { target: { value: '7' } });
    fireEvent.change(subjectInput('Ciências da Natureza'), { target: { value: '9' } });
    fireEvent.change(subjectInput('Ciências Humanas'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));

    await waitFor(() => expect(mockSaveGrade).toHaveBeenCalledTimes(1));
    const payload = mockSaveGrade.mock.calls[0][0];
    expect(payload.scores.linguaPortuguesa).toBe(8.5);
    expect(typeof payload.scores.linguaPortuguesa).toBe('number');
  });

  // Revisão do PR #15, item 5: nunca arredondar silenciosamente — mais de
  // duas casas decimais é um erro de validação, não um valor "corrigido"
  // por baixo dos panos.
  describe('validação de casas decimais (ponto ou vírgula, nunca arredondamento silencioso)', () => {
    it('rejeita vírgula com três casas decimais (7,123)', async () => {
      renderGradeForm();
      fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '7,123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));
      await waitFor(() => expect(screen.getByText(/Nota de Língua Portuguesa inválida/)).toBeInTheDocument());
      expect(mockSaveGrade).not.toHaveBeenCalled();
    });

    it('rejeita ponto com três casas decimais (7.123)', async () => {
      renderGradeForm();
      fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '7.123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));
      await waitFor(() => expect(screen.getByText(/Nota de Língua Portuguesa inválida/)).toBeInTheDocument());
      expect(mockSaveGrade).not.toHaveBeenCalled();
    });

    it('aceita nota inteira (7)', async () => {
      mockSaveGrade.mockResolvedValue(undefined);
      renderGradeForm();
      fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '7' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));
      await waitFor(() => expect(mockSaveGrade).toHaveBeenCalledTimes(1));
      expect(mockSaveGrade.mock.calls[0][0].scores.linguaPortuguesa).toBe(7);
    });

    it('aceita uma casa decimal (7,1)', async () => {
      mockSaveGrade.mockResolvedValue(undefined);
      renderGradeForm();
      fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '7,1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));
      await waitFor(() => expect(mockSaveGrade).toHaveBeenCalledTimes(1));
      expect(mockSaveGrade.mock.calls[0][0].scores.linguaPortuguesa).toBe(7.1);
    });

    it('aceita exatamente duas casas decimais (7,12)', async () => {
      mockSaveGrade.mockResolvedValue(undefined);
      renderGradeForm();
      fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '7,12' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));
      await waitFor(() => expect(mockSaveGrade).toHaveBeenCalledTimes(1));
      expect(mockSaveGrade.mock.calls[0][0].scores.linguaPortuguesa).toBe(7.12);
    });

    it('preserva nota zero (não trata como campo vazio)', async () => {
      mockSaveGrade.mockResolvedValue(undefined);
      renderGradeForm();
      fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '0' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));
      await waitFor(() => expect(mockSaveGrade).toHaveBeenCalledTimes(1));
      expect(mockSaveGrade.mock.calls[0][0].scores.linguaPortuguesa).toBe(0);
    });

    it('rejeita notação exponencial (1e1)', async () => {
      renderGradeForm();
      fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '1e1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));
      await waitFor(() => expect(screen.getByText(/Nota de Língua Portuguesa inválida/)).toBeInTheDocument());
      expect(mockSaveGrade).not.toHaveBeenCalled();
    });
  });

  it('exibe o alerta "Abaixo da média de referência" quando a média parcial fica abaixo de 6,0', async () => {
    renderGradeForm();
    fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '4' } });
    fireEvent.change(subjectInput('Matemática'), { target: { value: '5' } });
    await waitFor(() =>
      expect(screen.getByText('Abaixo da média de referência para monitoramento.')).toBeInTheDocument()
    );
  });

  it('nota não numérica bloqueia o envio com mensagem clara e NÃO chama o serviço (sem gravação parcial)', async () => {
    renderGradeForm();
    fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));

    await waitFor(() =>
      expect(screen.getByText(/Nota de Língua Portuguesa inválida/)).toBeInTheDocument()
    );
    expect(mockSaveGrade).not.toHaveBeenCalled();
  });

  it('erro do serviço (ex.: falha na auditoria) fica visível e onSaved NÃO é chamado', async () => {
    const { StudentBimesterGradeValidationError } = await import('../src/lib/studentBimesterGradeService');
    mockSaveGrade.mockRejectedValueOnce(new StudentBimesterGradeValidationError('Cadastro do estudante não encontrado ou inativo.'));
    const onSaved = vi.fn();
    renderGradeForm({ onSaved });

    fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));

    await waitFor(() =>
      expect(screen.getByText('Cadastro do estudante não encontrado ou inativo.')).toBeInTheDocument()
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('pré-carrega notas existentes formatadas com vírgula (correção do mesmo bimestre)', () => {
    renderGradeForm({
      existingScores: { linguaPortuguesa: 8.5, matematica: null, cienciasNatureza: 7, cienciasHumanas: null },
    });
    expect(subjectInput('Língua Portuguesa').value).toBe('8,5');
    expect(subjectInput('Ciências da Natureza').value).toBe('7');
    expect(subjectInput('Matemática').value).toBe('');
  });

  // Revisão do PR #15, item 6: observação existente carregada, editável e
  // removível — nunca some silenciosamente nem "ressuscita" depois de
  // apagada, já que setDoc substitui o documento inteiro.
  describe('observação existente', () => {
    function observacaoInput() {
      return screen.getByLabelText('Observação (opcional)') as HTMLTextAreaElement;
    }

    it('observação existente aparece pré-carregada', () => {
      renderGradeForm({ existingObservacao: 'Estudante com dificuldade em leitura.' });
      expect(observacaoInput().value).toBe('Estudante com dificuldade em leitura.');
    });

    it('sem observação existente, o campo começa vazio', () => {
      renderGradeForm();
      expect(observacaoInput().value).toBe('');
    });

    it('observação existente pode ser alterada e o novo texto é enviado ao serviço', async () => {
      mockSaveGrade.mockResolvedValue(undefined);
      renderGradeForm({ existingObservacao: 'Observação antiga' });

      fireEvent.change(observacaoInput(), { target: { value: 'Observação atualizada' } });
      fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));

      await waitFor(() => expect(mockSaveGrade).toHaveBeenCalledTimes(1));
      expect(mockSaveGrade.mock.calls[0][0].observacao).toBe('Observação atualizada');
    });

    it('apagar a observação envia null (nunca undefined) para garantir que o campo é removido, não preservado', async () => {
      mockSaveGrade.mockResolvedValue(undefined);
      renderGradeForm({ existingObservacao: 'Observação a ser apagada' });

      fireEvent.change(observacaoInput(), { target: { value: '' } });
      fireEvent.change(subjectInput('Língua Portuguesa'), { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));

      await waitFor(() => expect(mockSaveGrade).toHaveBeenCalledTimes(1));
      expect(mockSaveGrade.mock.calls[0][0].observacao).toBeNull();
    });

    it('demais campos (scores) permanecem preservados ao apagar só a observação', async () => {
      mockSaveGrade.mockResolvedValue(undefined);
      renderGradeForm({
        existingScores: { linguaPortuguesa: 8.5, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 },
        existingObservacao: 'Observação a ser apagada',
      });

      fireEvent.change(observacaoInput(), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar notas' }));

      await waitFor(() => expect(mockSaveGrade).toHaveBeenCalledTimes(1));
      const payload = mockSaveGrade.mock.calls[0][0];
      expect(payload.observacao).toBeNull();
      expect(payload.scores).toEqual({ linguaPortuguesa: 8.5, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 });
    });
  });

  it('botão Cancelar fecha sem salvar', () => {
    const onClose = vi.fn();
    renderGradeForm({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockSaveGrade).not.toHaveBeenCalled();
  });
});
