import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Discord Role Manager</h1>
          <p className="text-gray-600">
            Bot para gerenciamento de cargos com botões interativos e seleção dinâmica de membros.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
