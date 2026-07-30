import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';
import {
  db,
  OperationType,
  handleFirestoreError
} from './firebase';

// Initial mocks for seeding Firestore when empty
export const SEED_SCHOOLS = [
  // Originally monitored 7 schools (exact name alignment for continuity)
  { id: 'diva-cabral', nome: 'EEM Diva Cabral', codInep: '23067918', cidade: 'Fortaleza', matriculas: 812, idebMedio: 6.0, metaIdeb: 6.3, status: 'Ativo' },
  { id: 'figueiredo-correia', nome: 'EEM Figueiredo Correia', codInep: '23070242', cidade: 'Fortaleza', matriculas: 372, idebMedio: 7.1, metaIdeb: 7.3, status: 'Ativo' },
  { id: 'jose-leopoldino', nome: 'EEM José Leopoldino da Silva', codInep: '23068914', cidade: 'Fortaleza', matriculas: 537, idebMedio: 6.4, metaIdeb: 6.6, status: 'Ativo' },
  { id: 'canindezinho', nome: 'EEM São Francisco Canindezinho', codInep: '23233168', cidade: 'Fortaleza', matriculas: 464, idebMedio: 5.9, metaIdeb: 6.1, status: 'Ativo' },
  { id: 'anisio-teixeira', nome: 'EEMTI Anísio Teixeira', codInep: '23065214', cidade: 'Fortaleza', matriculas: 272, idebMedio: 6.1, metaIdeb: 6.3, status: 'Ativo' },
  { id: 'estado-amazonas', nome: 'EEMTI Estado do Amazonas', codInep: '23069511', cidade: 'Fortaleza', matriculas: 237, idebMedio: 6.8, metaIdeb: 7.0, status: 'Ativo' },
  { id: 'osires-pontes', nome: 'EEMTI Senador Osires Pontes', codInep: '23069163', cidade: 'Fortaleza', matriculas: 351, idebMedio: 6.2, metaIdeb: 6.4, status: 'Ativo' },

  // Remaining 49 schools in SEFOR 3 (extracted from the SIGE Enturmação PDF list)
  { id: 'centro-referencia', nome: 'CENTRO DE REFERÊNCIA EM EDUCAÇÃO SPECIALIZADO', codInep: '23000043', cidade: 'Fortaleza', matriculas: 1174, idebMedio: 5.5, metaIdeb: 5.8, status: 'Ativo' },
  { id: 'eeep-joaquim-moreira', nome: 'EEEP JOAQUIM MOREIRA DE SOUSA', codInep: '23068884', cidade: 'Fortaleza', matriculas: 389, idebMedio: 6.8, metaIdeb: 7.0, status: 'Ativo' },
  { id: 'eeep-juarez-tavora', nome: 'EEEP JUAREZ TÁVORA', codInep: '23072750', cidade: 'Fortaleza', matriculas: 456, idebMedio: 6.5, metaIdeb: 6.8, status: 'Ativo' },
  { id: 'eeep-paulo-vi', nome: 'EEEP PAULO VI', codInep: '23075864', cidade: 'Fortaleza', matriculas: 446, idebMedio: 6.7, metaIdeb: 6.9, status: 'Ativo' },
  { id: 'eefm-joaquim-alves', nome: 'EEFM JOAQUIM ALVES', codInep: '23072008', cidade: 'Fortaleza', matriculas: 529, idebMedio: 5.8, metaIdeb: 6.1, status: 'Ativo' },
  { id: 'eefm-jader-moreira', nome: 'EEFM PROFESSOR JÁDER MOREIRA DE CARVALHO', codInep: '23071460', cidade: 'Fortaleza', matriculas: 968, idebMedio: 5.6, metaIdeb: 5.9, status: 'Ativo' },
  { id: 'eefm-mario-schenberg', nome: 'EEFM PROFESSOR MÁRIO SCHENBERG', codInep: '23225386', cidade: 'Fortaleza', matriculas: 325, idebMedio: 5.7, metaIdeb: 6.0, status: 'Ativo' },
  { id: 'eem-adauto-bezerra', nome: 'EEM GOVERNADOR ADAUTO BEZERRA', codInep: '23064684', cidade: 'Fortaleza', matriculas: 1517, idebMedio: 7.2, metaIdeb: 7.4, status: 'Ativo' },
  { id: 'eemti-estado-parana', nome: 'EEMTI ESTADO DO PARANÁ', codInep: '23068841', cidade: 'Fortaleza', matriculas: 170, idebMedio: 5.9, metaIdeb: 6.2, status: 'Ativo' },
  { id: 'eemti-jenny-gomes', nome: 'EEMTI JENNY GOMES', codInep: '23071591', cidade: 'Fortaleza', matriculas: 349, idebMedio: 6.4, metaIdeb: 6.6, status: 'Ativo' },
  { id: 'eemti-joao-mattos', nome: 'EEMTI JOÃO MATTOS', codInep: '23069260', cidade: 'Fortaleza', matriculas: 400, idebMedio: 6.1, metaIdeb: 6.3, status: 'Ativo' },
  { id: 'eemti-castelo-branco', nome: 'EEMTI MARECHAL HUMBERTO CASTELO BRANCO', codInep: '23071095', cidade: 'Fortaleza', matriculas: 183, idebMedio: 5.8, metaIdeb: 6.0, status: 'Ativo' },
  { id: 'eemti-maria-thomasia', nome: 'EEMTI MARIA THOMÁSIA', codInep: '23078669', cidade: 'Fortaleza', matriculas: 288, idebMedio: 6.0, metaIdeb: 6.2, status: 'Ativo' },
  { id: 'eemti-pres-castelo-branco', nome: 'EEMTI PRESIDENTE HUMBERTO CASTELO BRANCO', codInep: '23071087', cidade: 'Fortaleza', matriculas: 444, idebMedio: 5.9, metaIdeb: 6.2, status: 'Ativo' },
  { id: 'eemti-jose-aurelio', nome: 'EEMTI PROFESSOR CORONEL JOSÉ AURÉLIO CÂMARA', codInep: '23072199', cidade: 'Fortaleza', matriculas: 223, idebMedio: 6.2, metaIdeb: 6.4, status: 'Ativo' },
  { id: 'eemti-hermenegildo', nome: 'EEMTI PROFESSOR HERMENEGILDO FIRMEZA', codInep: '23071001', cidade: 'Fortaleza', matriculas: 454, idebMedio: 6.3, metaIdeb: 6.5, status: 'Ativo' },
  { id: 'eemti-joao-piamarta', nome: 'EEMTI SÃO JOÃO PIAMARTA', codInep: '23259639', cidade: 'Fortaleza', matriculas: 267, idebMedio: 6.1, metaIdeb: 6.3, status: 'Ativo' },
  { id: 'eemti-fernandes-tavora', nome: 'EEMTI SENADOR FERNANDES TÁVORA', codInep: '23069627', cidade: 'Fortaleza', matriculas: 231, idebMedio: 5.7, metaIdeb: 6.0, status: 'Ativo' },
  { id: 'inst-educacao', nome: 'INSTITUTO DE EDUCAÇÃO DO CEARÁ', codInep: '23066717', cidade: 'Fortaleza', matriculas: 275, idebMedio: 6.6, metaIdeb: 6.8, status: 'Ativo' },
  { id: 'eeep-darcy-ribeiro', nome: 'EEEP DARCY RIBEIRO', codInep: '23246812', cidade: 'Fortaleza', matriculas: 518, idebMedio: 6.9, metaIdeb: 7.1, status: 'Ativo' },
  { id: 'eeep-icaro-sousa', nome: 'EEEP ÍCARO DE SOUSA MOREIRA', codInep: '23323426', cidade: 'Fortaleza', matriculas: 524, idebMedio: 6.8, metaIdeb: 7.0, status: 'Ativo' },
  { id: 'eeep-leonel-brizola', nome: 'EEEP LEONEL DE MOURA BRIZOLA', codInep: '23252588', cidade: 'Fortaleza', matriculas: 514, idebMedio: 6.7, metaIdeb: 6.9, status: 'Ativo' },
  { id: 'eeep-cesar-campelo', nome: 'EEEP PROFESSOR CÉSAR CAMPELO', codInep: '23069040', cidade: 'Fortaleza', matriculas: 532, idebMedio: 6.6, metaIdeb: 6.8, status: 'Ativo' },
  { id: 'eeep-onelio-porto', nome: 'EEEP PROFESSOR ONÉLIO PORTO', codInep: '23069074', cidade: 'Fortaleza', matriculas: 426, idebMedio: 6.5, metaIdeb: 6.7, status: 'Ativo' },
  { id: 'eefm-joaci-pereira', nome: 'EEFM DEPUTADO JOACI PEREIRA', codInep: '23069490', cidade: 'Fortaleza', matriculas: 753, idebMedio: 5.8, metaIdeb: 6.1, status: 'Ativo' },
  { id: 'eefm-julia-alves', nome: 'EEFM DONA JÚLIA ALVES PESSOA', codInep: '23068566', cidade: 'Fortaleza', matriculas: 1051, idebMedio: 6.2, metaIdeb: 6.4, status: 'Ativo' },
  { id: 'eefm-michelson-nobre', nome: 'EEFM MICHELSON NOBRE DA SILVA', codInep: '23233893', cidade: 'Fortaleza', matriculas: 450, idebMedio: 5.5, metaIdeb: 5.8, status: 'Ativo' },
  { id: 'eefm-paulo-elpidio', nome: 'EEFM PAULO ELPÍDIO', codInep: '23234296', cidade: 'Fortaleza', matriculas: 240, idebMedio: 5.9, metaIdeb: 6.1, status: 'Ativo' },
  { id: 'eefm-santo-amaro', nome: 'EEFM SANTO AMARO', codInep: '23225360', cidade: 'Fortaleza', matriculas: 728, idebMedio: 6.0, metaIdeb: 6.2, status: 'Ativo' },
  { id: 'eem-ubirajara-indio', nome: 'EEM DR. UBIRAJARA ÍNDIO DO CEARÁ', codInep: '23078170', cidade: 'Fortaleza', matriculas: 917, idebMedio: 6.1, metaIdeb: 6.3, status: 'Ativo' },
  { id: 'eem-sao-jose', nome: 'EEM SÃO JOSÉ', codInep: '23264985', cidade: 'Fortaleza', matriculas: 396, idebMedio: 6.3, metaIdeb: 6.5, status: 'Ativo' },
  { id: 'eemti-caic-maria', nome: 'EEMTI CAIC MARIA ALVES CARIOCA', codInep: '23188154', cidade: 'Fortaleza', matriculas: 368, idebMedio: 5.8, metaIdeb: 6.0, status: 'Ativo' },
  { id: 'eemti-irapuan-pinheiro', nome: 'EEMTI DEPUTADO IRAPUAN CAVALCANTE PINHEIRO', codInep: '23071370', cidade: 'Fortaleza', matriculas: 473, idebMedio: 6.0, metaIdeb: 6.2, status: 'Ativo' },
  { id: 'eemti-gentil-barreira', nome: 'EEMTI DOUTOR GENTIL BARREIRA', codInep: '23070552', cidade: 'Fortaleza', matriculas: 905, idebMedio: 6.1, metaIdeb: 6.3, status: 'Ativo' },
  { id: 'eemti-estado-maranhao', nome: 'EEMTI ESTADO DO MARANHÃO', codInep: '23068825', cidade: 'Fortaleza', matriculas: 278, idebMedio: 5.6, metaIdeb: 5.9, status: 'Ativo' },
  { id: 'eemti-irmao-urbano', nome: 'EEMTI IRMÃO URBANO GONZALEZ RODRIGUEZ', codInep: '23186518', cidade: 'Fortaleza', matriculas: 393, idebMedio: 6.1, metaIdeb: 6.3, status: 'Ativo' },
  { id: 'eemti-liceu-conj-ceara', nome: 'EEMTI LICEU DO CONJUNTO CEARÁ', codInep: '23225416', cidade: 'Fortaleza', matriculas: 546, idebMedio: 6.4, metaIdeb: 6.6, status: 'Ativo' },
  { id: 'eemti-liceu-domingos', nome: 'EEMTI LICEU PROFESSOR DOMINGOS BRASILEIRO', codInep: '23272058', cidade: 'Fortaleza', matriculas: 495, idebMedio: 6.2, metaIdeb: 6.4, status: 'Ativo' },
  { id: 'eemti-parque-vargas', nome: 'EEMTI PARQUE PRESIDENTE VARGAS', codInep: '23078340', cidade: 'Fortaleza', matriculas: 762, idebMedio: 5.9, metaIdeb: 6.2, status: 'Ativo' },
  { id: 'eemti-patativa-assare', nome: 'EEMTI POETA PATATIVA DO ASSARÉ', codInep: '23233885', cidade: 'Fortaleza', matriculas: 586, idebMedio: 6.0, metaIdeb: 6.2, status: 'Ativo' },
  { id: 'eemti-adalgisa-soares', nome: 'EEMTI PROFESSORA ADALGISA BONFIM SOARES', codInep: '23064676', cidade: 'Fortaleza', matriculas: 635, idebMedio: 5.8, metaIdeb: 6.1, status: 'Ativo' },
  { id: 'eemti-adelia-feijo', nome: 'EEMTI PROFESSORA ADÉLIA BRASIL FEIJÓ', codInep: '23186364', cidade: 'Fortaleza', matriculas: 532, idebMedio: 6.1, metaIdeb: 6.3, status: 'Ativo' },
  { id: 'eemti-maria-nunes', nome: 'EEMTI PROFESSORA MARIA ANTONIETA NUNES', codInep: '23065486', cidade: 'Fortaleza', matriculas: 509, idebMedio: 5.9, metaIdeb: 6.1, status: 'Ativo' },
  { id: 'eemti-maria-margarida', nome: 'EEMTI PROFESSORA MARIA MARGARIDA CASTRO ALMEIDA', codInep: '23073713', cidade: 'Fortaleza', matriculas: 473, idebMedio: 6.0, metaIdeb: 6.2, status: 'Ativo' },
  { id: 'eemti-edmilson-almeida', nome: 'EEMTI PROFESSOR EDMILSON GUIMARÃES DE ALMEIDA', codInep: '23068183', cidade: 'Fortaleza', matriculas: 227, idebMedio: 5.7, metaIdeb: 6.0, status: 'Ativo' },
  { id: 'eemti-jocie-menezes', nome: 'EEMTI PROFESSOR JOCIÊ CAMINHA DE MENEZES', codInep: '23068965', cidade: 'Fortaleza', matriculas: 261, idebMedio: 5.8, metaIdeb: 6.0, status: 'Ativo' },
  { id: 'eemti-jose-maria', nome: 'EEMTI PROFESSOR JOSÉ MARIA CAMPOS DE OLIVEIRA', codInep: '23072431', cidade: 'Fortaleza', matriculas: 297, idebMedio: 6.0, metaIdeb: 6.2, status: 'Ativo' },
  { id: 'eemti-placido-castelo', nome: 'EEMTI PROFESSOR PLÁCIDO ADERALDO CASTELO', codInep: '23069082', cidade: 'Fortaleza', matriculas: 434, idebMedio: 6.3, metaIdeb: 6.5, status: 'Ativo' },
  { id: 'eemti-sao-francisco-bom', nome: 'EEMTI SÃO FRANCISCO DE ASSIS - BOM JARDIM', codInep: '23069988', cidade: 'Fortaleza', matriculas: 261, idebMedio: 5.6, metaIdeb: 5.9, status: 'Ativo' }
];

export const SEED_TURMAS = [
  {
    id: 'turma-3a-diva',
    escolaId: 'diva-cabral',
    escolaNome: 'EEM Diva Cabral',
    nome: '3º Ano A - Matutino',
    ano: '3º Ano',
    periodo: 'Matutino',
    anoLetivo: 2026,
    lancamentosBimestre: { b1: 'Lançado', b2: 'Lançado', b3: 'Pendente', b4: 'Pendente' },
    mediaBimestre: { b1: 7.5, b2: 7.8, b3: 0, b4: 0 },
    alunosSinalizados: 2
  },
  {
    id: 'turma-3b-diva',
    escolaId: 'diva-cabral',
    escolaNome: 'EEM Diva Cabral',
    nome: '3º Ano B - Vespertino',
    ano: '3º Ano',
    periodo: 'Vespertino',
    anoLetivo: 2026,
    lancamentosBimestre: { b1: 'Lançado', b2: 'Pendente', b3: 'Pendente', b4: 'Pendente' },
    mediaBimestre: { b1: 5.4, b2: 0, b3: 0, b4: 0 },
    alunosSinalizados: 8
  },
  {
    id: 'turma-3a-figueiredo',
    escolaId: 'figueiredo-correia',
    escolaNome: 'EEM Figueiredo Correia',
    nome: '3º Ano A - Matutino',
    ano: '3º Ano',
    periodo: 'Matutino',
    anoLetivo: 2026,
    lancamentosBimestre: { b1: 'Lançado', b2: 'Lançado', b3: 'Pendente', b4: 'Pendente' },
    mediaBimestre: { b1: 7.1, b2: 7.2, b3: 0, b4: 0 },
    alunosSinalizados: 3
  },
  {
    id: 'turma-3a-leopoldino',
    escolaId: 'jose-leopoldino',
    escolaNome: 'EEM José Leopoldino da Silva',
    nome: '3º Ano A - Matutino',
    ano: '3º Ano',
    periodo: 'Matutino',
    anoLetivo: 2026,
    lancamentosBimestre: { b1: 'Lançado', b2: 'Lançado', b3: 'Pendente', b4: 'Pendente' },
    mediaBimestre: { b1: 6.4, b2: 6.5, b3: 0, b4: 0 },
    alunosSinalizados: 1
  },
  {
    id: 'turma-3a-canindezinho',
    escolaId: 'canindezinho',
    escolaNome: 'EEM São Francisco Canindezinho',
    nome: '3º Ano A - Matutino',
    ano: '3º Ano',
    periodo: 'Matutino',
    anoLetivo: 2026,
    lancamentosBimestre: { b1: 'Pendente', b2: 'Pendente', b3: 'Pendente', b4: 'Pendente' },
    mediaBimestre: { b1: 5.0, b2: 0, b3: 0, b4: 0 },
    alunosSinalizados: 11
  },
  {
    id: 'turma-3a-anisio',
    escolaId: 'anisio-teixeira',
    escolaNome: 'EEMTI Anísio Teixeira',
    nome: '3º Ano A - Matutino',
    ano: '3º Ano',
    periodo: 'Matutino',
    anoLetivo: 2026,
    lancamentosBimestre: { b1: 'Lançado', b2: 'Lançado', b3: 'Pendente', b4: 'Pendente' },
    mediaBimestre: { b1: 6.1, b2: 6.2, b3: 0, b4: 0 },
    alunosSinalizados: 4
  }
];

export const SEED_GRADES = [
  { id: 'grade-1', nome: 'Amanda Sousa Silva', turma: '3º Ano A - Matutino', portugues: 8.5, matematica: 7.2, ciencias: 9.0, bimestre: '1º Bimestre' },
  { id: 'grade-2', nome: 'Bruno Costa de Oliveira', turma: '3º Ano A - Matutino', portugues: 5.5, matematica: 6.0, ciencias: 5.8, bimestre: '1º Bimestre' },
  { id: 'grade-3', nome: 'Carlos Henrique Santos', turma: '3º Ano B - Vespertino', portugues: 7.0, matematica: 8.5, ciencias: 7.8, bimestre: '1º Bimestre' },
  { id: 'grade-4', nome: 'Daniel Gomes Ferreira', turma: '3º Ano A - Matutino', portugues: 9.2, matematica: 9.5, ciencias: 9.8, bimestre: '1º Bimestre' },
  { id: 'grade-5', nome: 'Eliza Pereira de Melo', turma: '3º Ano B - Vespertino', portugues: 4.8, matematica: 5.2, ciencias: 6.0, bimestre: '1º Bimestre' },
  { id: 'grade-6', nome: 'Fernando Albuquerque Lima', turma: '3º Ano A - Matutino', portugues: 6.4, matematica: 5.8, ciencias: 7.2, bimestre: '1º Bimestre' }
];

export const SEED_VISITAS = [
  { id: 'vis-1', escola: 'EEM Diva Cabral', tecnico: 'Prof. Sérgio Nogueira', data: '2026-06-05', foco: 'Análise de Notas e Fluxo Escolar', status: 'Agendada' },
  { id: 'vis-2', escola: 'EEM Figueiredo Correia', tecnico: 'Profa. Cleide Pinheiro', data: '2026-05-24', foco: 'Alinhamento Diretor de Turma (PPDT)', status: 'Realizada' },
  { id: 'vis-3', escola: 'EEM José Leopoldino da Silva', tecnico: 'Prof. Marcus Fernandes', data: '2026-06-12', foco: 'Visita de Intervenção de Baixo Desempenho', status: 'Agendada' }
];

// Helper to seed Firestore database with initial mock structure
export async function seedFirestoreDatabase() {
  // Bloqueio duplo contra seed em produção — a UI que chama esta função já
  // some do bundle de produção (ver NotasView.tsx), mas a função também se
  // recusa a rodar caso seja invocada por qualquer outro caminho.
  if (import.meta.env.PROD) {
    console.error('seedFirestoreDatabase: execução bloqueada em produção.');
    return false;
  }

  const path = 'schools';
  try {
    const schoolsSnap = await getDocs(collection(db, 'schools'));
    if (schoolsSnap.empty) {
      // Seed schools
      for (const school of SEED_SCHOOLS) {
        await setDoc(doc(db, 'schools', school.id), school);
      }
      // Seed turmas
      for (const turma of SEED_TURMAS) {
        await setDoc(doc(db, 'turmas', turma.id), turma);
      }
      // Seed grades
      for (const grade of SEED_GRADES) {
        await setDoc(doc(db, 'grades', grade.id), grade);
      }
      // Seed visitas
      for (const visita of SEED_VISITAS) {
        await setDoc(doc(db, 'visitas', visita.id), {
          escola: visita.escola,
          tecnico: visita.tecnico,
          data: visita.data,
          foco: visita.foco,
          status: visita.status
        });
      }
      return true;
    }
    return false;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

// Global hook/subscription setup helpers
export function subscribeToCollection(collectionName: string, callback: (data: any[]) => void, onError?: (err: any) => void) {
  return onSnapshot(collection(db, collectionName), (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(list);
  }, (err) => {
    console.error(`Erro ao assinar coleção ${collectionName}:`, err);
    if (onError) onError(err);
  });
}

// Update functions
export async function addDocument(collectionName: string, docId: string, data: any) {
  try {
    await setDoc(doc(db, collectionName, docId), data);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${collectionName}/${docId}`);
  }
}

export async function updateDocument(collectionName: string, docId: string, data: any) {
  try {
    await setDoc(doc(db, collectionName, docId), data, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${collectionName}/${docId}`);
  }
}

export async function deleteDocument(collectionName: string, docId: string) {
  try {
    await deleteDoc(doc(db, collectionName, docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${docId}`);
  }
}
