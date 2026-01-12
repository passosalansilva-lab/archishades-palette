import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("Erro 404: Usuário tentou acessar rota inexistente:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-white">
      <div className="text-center px-4">
        <h1 className="mb-4 text-8xl font-black text-orange-500">404</h1>
        <p className="mb-2 text-2xl font-semibold text-gray-800">Página não encontrada</p>
        <p className="mb-8 text-gray-600">A página que você está procurando não existe ou foi movida.</p>
        <Button asChild className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            Voltar para o início
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
