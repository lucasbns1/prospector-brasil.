import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { Dashboard } from '@/pages/Dashboard';
import { Login } from '@/pages/Login';
import { EmBreve } from '@/pages/EmBreve';
import { Configuracoes } from '@/pages/Configuracoes';
import { Leads } from '@/pages/Leads';
import { Importar } from '@/pages/Importar';
import { Campanhas } from '@/pages/Campanhas';
import { CampanhaDetalhe } from '@/pages/CampanhaDetalhe';
import { EstadoCampanhas } from '@/pages/EstadoCampanhas';
import { QuadroCampanha } from '@/pages/QuadroCampanha';
import { Tarefas } from '@/pages/Tarefas';
import { Notificacoes } from '@/pages/Notificacoes';
import { Planilhas } from '@/pages/Planilhas';
import { Semanas } from '@/pages/Semanas';
import { IA } from '@/pages/IA';
import { Conversas } from '@/pages/Conversas';
import { Canal } from '@/pages/Canal';
import { useUsuario } from '@/hooks/useAuth';
import { useEvents } from '@/hooks/useEvents';

function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-[var(--color-texto-suave)]">
      Carregando…
    </div>
  );
}

function AppAutenticado({
  usuario,
  podeSair,
}: {
  usuario: { id: string; email: string; nome: string };
  podeSair: boolean;
}) {
  // Uma unica conexao SSE para o app inteiro.
  const { status: statusSSE } = useEvents(true);

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar usuario={usuario} statusSSE={statusSSE} podeSair={podeSair} />
          <main className="flex-1 overflow-y-auto p-5 lg:p-6">
            <div className="mx-auto max-w-[1400px]">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/importar" element={<Importar />} />
                <Route path="/conversas" element={<Conversas />} />
                <Route path="/conversas/:leadId" element={<Conversas />} />
                <Route path="/canal" element={<Canal />} />
                <Route path="/campanhas" element={<Campanhas />} />
                <Route path="/campanhas/:id" element={<CampanhaDetalhe />} />
                <Route path="/estado" element={<EstadoCampanhas />} />
                <Route path="/estado/:id" element={<QuadroCampanha />} />
                <Route path="/tarefas" element={<Tarefas />} />
                <Route path="/notificacoes" element={<Notificacoes />} />
                <Route path="/planilhas" element={<Planilhas />} />
                <Route path="/semanas" element={<Semanas />} />
                <Route path="/ia" element={<IA />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
                <Route
                  path="*"
                  element={
                    <EmBreve
                      titulo="Página não encontrada"
                      fase="—"
                      descricao="Este endereço não existe."
                    />
                  }
                />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export function App() {
  const { data, isLoading } = useUsuario();

  if (isLoading) return <Carregando />;
  if (!data?.usuario) return <Login />;

  // Sem login, "Sair" nao leva a lugar nenhum: a API entraria de novo
  // no mesmo instante. O botao so aparece quando o login existe.
  return (
    <AppAutenticado usuario={data.usuario} podeSair={data.loginObrigatorio !== false} />
  );
}
