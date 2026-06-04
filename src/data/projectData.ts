import { ProjectFile, Recommendation } from '../types';

export const USER_PROJECT_FILES: ProjectFile[] = [
  {
    name: "package.json",
    path: "/package.json",
    language: "json",
    description: "Configuração de dependências do PC do usuário.",
    content: `{
  "name": "sefor3-gestao-regional",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@stripe/react-stripe-js": "4.0.2",
    "@supabase/supabase-js": "2.57.4",
    "firebase": "12.0.0",
    "html2canvas": "^1.4.1",
    "i18next": "^25.3.2",
    "i18next-browser-languagedetector": "^8.2.0",
    "jspdf": "^4.2.1",
    "lucide-react": "^0.469.0",
    "react": "^19.1.2",
    "react-dom": "^19.1.2",
    "react-i18next": "^15.6.0",
    "react-router-dom": "^7.6.3",
    "recharts": "3.2.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.30.1",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.17",
    "typescript": "~5.8.3"
  }
}`
  },
  {
    name: "tsconfig.app.json",
    path: "/tsconfig.app.json",
    language: "json",
    description: "Configurações do compilador TypeScript contendo flags relaxadas.",
    content: `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting e Configurações Relaxadas (Risco de Escalabilidade!) */
    "strict": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitAny": false,
    "strictNullChecks": false
  }
}`
  },
  {
    name: "firebase-blueprint.json",
    path: "/firebase-blueprint.json",
    language: "json",
    description: "Blueprint sugerido para a estrutura de dados das escolas da Regional (CREDE).",
    content: `{
  "entities": {
    "crede": {
      "title": "CREDE Regional",
      "description": "Dados da Coordenadoria Regional de Desenvolvimento da Educação",
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "nome": { "type": "string" },
        "cidade": { "type": "string" }
      },
      "required": ["id", "nome"]
    },
    "escola": {
      "title": "Escola da Regional",
      "description": "Cadastro da unidade educacional contendo indicadores básicos",
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "nome": { "type": "string" },
        "codInep": { "type": "string" },
        "matriculas": { "type": "number" },
        "idebMedio": { "type": "number" },
        "metaIdeb": { "type": "number" }
      },
      "required": ["id", "nome", "codInep"]
    },
    "visitaTecnica": {
      "title": "Visita Técnica",
      "description": "Registro de visitas pedagógicas de acompanhamento regional",
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "escolaId": { "type": "string" },
        "tecnicoId": { "type": "string" },
        "dataVisita": { "type": "string", "format": "date-time" },
        "observacoes": { "type": "string" },
        "status": { "type": "string", "enum": ["agendada", "realizada", "cancelada"] }
      },
      "required": ["id", "escolaId", "dataVisita", "status"]
    }
  },
  "firestore": {
    "/crede/{credeId}": {
      "schema": "crede",
      "description": "Documentos das CREDEs regionais"
    },
    "/crede/{credeId}/escolas/{escolaId}": {
      "schema": "escola",
      "description": "Coleção de escolas vinculadas a uma CREDE"
    },
    "/crede/{credeId}/escolas/{escolaId}/visitas/{visitaId}": {
      "schema": "visitaTecnica",
      "description": "Histórico de visitas técnicas em cada escola"
    }
  }
}`
  },
  {
    name: "firestore.rules",
    path: "/firestore.rules",
    language: "javascript",
    description: "Regras do Firestore com segurança de Zero-Trust e validações robustas.",
    content: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 1. Master Gate: default deny
    match /{document=**} {
      allow read, write: if false;
    }

    // Funções auxiliares robustas
    function isSignedIn() {
      return request.auth != null;
    }
    
    function emailVerified() {
      return isSignedIn() && request.auth.token.email_verified == true;
    }

    function isCredeAdmin(credeId) {
      return emailVerified() && 
        exists(/databases/$(database)/documents/crede/$(credeId)/admins/$(request.auth.uid));
    }

    function isSchoolStaff(credeId, escolaId) {
      return emailVerified() && (
        exists(/databases/$(database)/documents/crede/$(credeId)/escolas/$(escolaId)/gestores/$(request.auth.uid))
      );
    }

    // Regras de validação de dados básicas
    function isValidEscola(data) {
      return data.nome is string && data.nome.size() <= 200
        && data.codInep is string && data.codInep.size() == 8;
    }

    // Rotas de escolas
    match /crede/{credeId}/escolas/{escolaId} {
      allow read: if emailVerified(); // Usuários logados da Seduc podem ver indicadores
      allow create, delete: if isCredeAdmin(credeId);
      allow update: if isCredeAdmin(credeId) || (
        isSchoolStaff(credeId, escolaId) && 
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['matriculas', 'idebMedio'])
      );
    }
  }
}`
  }
];

export const RECOMMENDATIONS: Recommendation[] = [
  {
    id: "rec-redundancia",
    title: "Redundância de Infraestrutura (Firebase + Supabase)",
    category: "architecture",
    severity: "high",
    summary: "O projeto possui tanto '@supabase/supabase-js' quanto 'firebase' nas dependências de produção. Isso adiciona bando de dados redundantes e aumenta o tamanho do bundle significativamente.",
    diagnostic: "Ao analisar o package.json, identificamos ambas as bibliotecas instaladas em produção. Manter dois sistemas BaaS (Backend-as-a-Service) encarece o projeto, duplica a barreira de sincronização de dados dos alunos e aumenta o tempo de compressão e carregamento inicial da página (aumenta o tempo necessário para o First Contentful Paint).",
    solution: "Consolide em apenas um dos serviços. Recomendamos priorizar o SUPABASE caso a regional de educação precise de relacionamentos SQL rígidos (CREDE -> Município -> Escola -> Aluno -> Indicadores de Fluxo Escolar) ou o FIREBASE se o foco principal for sincronização de dados offline dos técnicos em campo durante visitas pedagógicas fora de sinal.",
    codeSuggestion: `// Exemplo de Migração para Supabase com Relacionamento e Joins das Escolas da Regional
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Busca escolas trazendo dados agregados da CREDE coordenadora num único comando SQL
export async function fetchEscolasComRegional() {
  const { data, error } = await supabase
    .from('escolas')
    .select(\`
      id,
      nome,
      cod_inep,
      matriculas,
      ideb_medio,
      crede:crede_id (
        id,
        nome,
        coordenador
      )
    \`);
    
  if (error) throw error;
  return data;
}`,
    codeLang: "typescript"
  },
  {
    id: "rec-typescript",
    title: "Ativar Modo Estrito (TypeScript Strict)",
    category: "security",
    severity: "high",
    summary: "As opções 'strict', 'noImplicitAny' e 'strictNullChecks' estão desativadas no tsconfig.app.json, permitindo tipos flutuantes implícitos em dados cruciais como notas e fluxo de alunos.",
    diagnostic: "Se 'strict': false estiver ativo, o TypeScript não garante a inexistência de 'undefined' ou 'null' ao ler propriedades, o que pode causar o lendário erro 'Cannot read properties of undefined' no momento em que um Técnico ou Gestor está gerando um relatório em PDF ou salvando notas escolares.",
    solution: "Ative 'strict': true no arquivo tsconfig.app.json. Corrija os erros de tipagem resultantes declarando explicitamente as interfaces de dados (como Escola, Visita Pedagógica, etc.) na sua aplicação.",
    codeSuggestion: `// /src/types.ts - Declaração forte para evitar falhas silenciosas
export interface EscolasData {
  id: string;
  nome: string;
  codInep: string;
  matriculas: number;
  idebMedio: number;
  metaIdeb: number;
}

export interface VisitaTecnica {
  id: string;
  escolaId: string;
  tecnicoId: string;
  dataVisita: Date; // Tipagem robusta
  observacoes?: string; // Opcional seguro
  status: 'agendada' | 'realizada' | 'cancelada';
}`,
    codeLang: "typescript"
  },
  {
    id: "rec-pdf-export",
    title: "Otimizar Exportação de Arquivos PDF",
    category: "performance",
    severity: "medium",
    summary: "'html2canvas' e 'jspdf' estão executando na thread principal, gerando congelamentos de tela (UI Thread Freeze) ao salvar relatórios densos das escolas.",
    diagnostic: "A renderização de canvas de gráficos grandes do Recharts via html2canvas exige muito processamento gráfico da CPU do navegador. Enquanto roda, o navegador paralisa timers e animações CSS, dando a impressão de travamento ao usuário.",
    solution: "1. Renderize relatórios menores sob demanda de forma síncrona.\\n2. Divida os gráficos de forma a não renderizar o DOM inteiro de uma vez.\\n3. Mostre um feedback visual de carregamento animado (Skeleton) enquanto o PDF é compilado e utilize o debounce em buscas de filtros das escolas para reduzir re-renders.",
    codeSuggestion: `// Otimização de geração de PDF usando jspdf de forma assíncrona
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export async function exportarRelatorioComIndicadores(elementId: string) {
  const input = document.getElementById(elementId);
  if (!input) return;

  // 1. Mostrar spinner de carregamento no estado do React antes de processar
  // 2. Executar em bloco assíncrono liberando a CPU entre etapas
  const canvas = await html2canvas(input, {
    scale: 1.5, // Equilíbrio ótimo entre tamanho do arquivo e nitidez do texto
    useCORS: true,
    logging: false
  });
  
  const imgData = canvas.toDataURL("image/jpeg", 0.75); // Reduz peso usando jpeg
  const pdf = new jsPDF("p", "mm", "a4");
  const imgWidth = 210;
  const pageHeight = 295;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  
  pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
  pdf.save("sefor3-relatorio-regional.pdf");
}`,
    codeLang: "typescript"
  },
  {
    id: "rec-caching",
    title: "Estratégia de Caching e Estado com React Query / SWR",
    category: "performance",
    severity: "medium",
    summary: "Seu projeto usa Firebase/Supabase e React Router. Não há um estado de cache global, forçando múltiplas leituras custosas e caras ao alternar páginas do Sefor 3.",
    diagnostic: "Sempre que um gestor navega de 'Escolas' para 'Visitas' e retorna, as consultas do Firestore ou Supabase são disparadas novamente. Na modalidade de faturamento por leitura (Firestore Spark/Enterprise) ou limite de conexões, isso aumenta o custo rapidamente e prejudica a experiência offline.",
    solution: "Considere instalar o TanStack Query (@tanstack/react-query). Ele lida com caching local na memória do cliente automaticamente, sincronizando em segundo plano e oferecendo estados rápidos sem re-reads desnecessários.",
    codeSuggestion: `// Exemplo de integração do React Query com Firestore (Economia de até 80% em leituras)
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebaseConfig';

export function useEscolasQuery(credeId: string) {
  return useQuery({
    queryKey: ['escolas', credeId],
    queryFn: async () => {
      const colRef = collection(db, 'crede', credeId, 'escolas');
      const snapshot = await getDocs(colRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    staleTime: 5 * 60 * 1050, // Considera os dados frescos por 5 minutos
    gcTime: 30 * 60 * 1050,    // Mantém no lixo antes de apagar
  });
}`,
    codeLang: "typescript"
  }
];
