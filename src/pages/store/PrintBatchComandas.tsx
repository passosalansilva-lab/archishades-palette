import { useState, useRef, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Printer, FileText, ArrowLeft, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { generateComandaBarcode } from '@/components/comandas/PrintComanda';
import JsBarcode from 'jsbarcode';

export default function PrintBatchComandas() {
  const navigate = useNavigate();
  const [startNumber, setStartNumber] = useState(1);
  const [endNumber, setEndNumber] = useState(50);
  const [companyName, setCompanyName] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Fetch company name
  useEffect(() => {
    const fetchCompanyName = async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: company } = await supabase
            .from('companies')
            .select('name')
            .eq('owner_id', user.id)
            .single();
          if (company) {
            setCompanyName(company.name);
          }
        }
      } catch (error) {
        console.error('Error fetching company:', error);
      }
    };
    fetchCompanyName();
  }, []);

  const getOrCreateIframe = useCallback(() => {
    if (iframeRef.current) {
      return iframeRef.current;
    }
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);
    iframeRef.current = iframe;
    return iframe;
  }, []);

  useEffect(() => {
    return () => {
      if (iframeRef.current) {
        document.body.removeChild(iframeRef.current);
        iframeRef.current = null;
      }
    };
  }, []);

  const generateBarcodeHtml = (number: number): string => {
    const canvas = document.createElement('canvas');
    const barcodeValue = generateComandaBarcode(number);
    
    try {
      JsBarcode(canvas, barcodeValue, {
        format: 'CODE128',
        width: 2,
        height: 40,
        displayValue: true,
        fontSize: 10,
        margin: 5,
        background: '#ffffff',
      });
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Error generating barcode:', error);
      return '';
    }
  };

  const generatePrintContent = () => {
    const comandas: string[] = [];
    
    for (let i = startNumber; i <= endNumber; i++) {
      const barcodeDataUrl = generateBarcodeHtml(i);
      
      comandas.push(`
        <div class="comanda-card">
          <div class="company-name">${companyName || 'Estabelecimento'}</div>
          <div class="comanda-label">COMANDA</div>
          <div class="comanda-number">#${i}</div>
          <div class="barcode">
            <img src="${barcodeDataUrl}" alt="Código de barras" />
          </div>
          <div class="barcode-note">Escaneie para abrir</div>
          <div class="divider"></div>
          <div class="lines">
            <div class="line"></div>
            <div class="line"></div>
            <div class="line"></div>
            <div class="line"></div>
            <div class="line"></div>
          </div>
        </div>
      `);
    }
    
    return comandas.join('');
  };

  const printStyles = `
    <style>
      @page {
        size: A4;
        margin: 10mm;
      }
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: 'Arial', sans-serif;
        font-size: 12px;
        line-height: 1.4;
        background: #fff;
      }
      .container {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10mm;
        padding: 5mm;
      }
      .comanda-card {
        border: 2px solid #000;
        border-radius: 8px;
        padding: 8mm;
        text-align: center;
        page-break-inside: avoid;
        break-inside: avoid;
        height: 90mm;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .company-name {
        font-size: 10px;
        font-weight: bold;
        color: #333;
        margin-bottom: 2mm;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .comanda-label {
        font-size: 8px;
        text-transform: uppercase;
        letter-spacing: 3px;
        color: #666;
      }
      .comanda-number {
        font-size: 36px;
        font-weight: bold;
        padding: 3mm;
        margin: 2mm 0;
        background: #000;
        color: #fff;
        border-radius: 4px;
      }
      .barcode {
        margin: 2mm 0;
      }
      .barcode img {
        max-width: 100%;
        height: 35px;
      }
      .barcode-note {
        font-size: 7px;
        color: #888;
        margin-bottom: 2mm;
      }
      .divider {
        border-top: 1px dashed #ccc;
        margin: 2mm 0;
      }
      .lines {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-evenly;
      }
      .line {
        border-bottom: 1px solid #ddd;
        height: 8mm;
      }
      
      @media screen {
        body {
          background: #f5f5f5;
          padding: 20px;
        }
        .container {
          max-width: 210mm;
          margin: 0 auto;
          background: #fff;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
      }
    </style>
  `;

  const handlePrint = () => {
    const content = generatePrintContent();
    const iframe = getOrCreateIframe();
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Comandas ${startNumber} a ${endNumber}</title>
          ${printStyles}
        </head>
        <body>
          <div class="container">
            ${content}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 300);
  };

  const totalComandas = Math.max(0, endNumber - startNumber + 1);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/comandas')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Imprimir Comandas em Lote</h1>
            <p className="text-muted-foreground">
              Gere comandas em branco com código de barras para usar na gráfica
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Configurações
              </CardTitle>
              <CardDescription>
                Defina o intervalo de comandas que deseja imprimir
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start">Número inicial</Label>
                  <Input
                    id="start"
                    type="number"
                    min={1}
                    value={startNumber}
                    onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">Número final</Label>
                  <Input
                    id="end"
                    type="number"
                    min={startNumber}
                    value={endNumber}
                    onChange={(e) => setEndNumber(Math.max(startNumber, parseInt(e.target.value) || startNumber))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Nome do estabelecimento</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Nome que aparecerá nas comandas"
                />
              </div>

              <div className="rounded-lg bg-muted p-4 text-center">
                <div className="text-3xl font-bold text-primary">{totalComandas}</div>
                <div className="text-sm text-muted-foreground">comandas serão geradas</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  ({Math.ceil(totalComandas / 9)} páginas A4 - 9 comandas por página)
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={handlePrint} className="flex-1 gap-2">
                  <Printer className="h-4 w-4" />
                  Imprimir Comandas
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowPreview(!showPreview)}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" />
                  {showPreview ? 'Ocultar' : 'Visualizar'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Como usar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  1
                </div>
                <p>Defina o intervalo de números das comandas (ex: 1 a 50)</p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  2
                </div>
                <p>Clique em "Imprimir Comandas" para gerar o PDF</p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  3
                </div>
                <p>Leve o PDF para a gráfica e imprima em papel cartão</p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  4
                </div>
                <p>Recorte cada comanda e plastifique se desejar</p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  5
                </div>
                <p>Use o leitor de código de barras para abrir as comandas no sistema</p>
              </div>

              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Dica:</strong> As comandas são geradas em formato A4 com 9 comandas por página (3x3), 
                  ideais para impressão em papel cartão ou couché 180g.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        {showPreview && (
          <Card>
            <CardHeader>
              <CardTitle>Pré-visualização</CardTitle>
              <CardDescription>
                Mostrando as primeiras {Math.min(9, totalComandas)} comandas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {Array.from({ length: Math.min(9, totalComandas) }, (_, i) => startNumber + i).map((num) => (
                  <ComandaPreviewCard 
                    key={num} 
                    number={num} 
                    companyName={companyName || 'Estabelecimento'} 
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function ComandaPreviewCard({ number, companyName }: { number: number; companyName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barcodeValue = generateComandaBarcode(number);

  useEffect(() => {
    if (canvasRef.current) {
      try {
        JsBarcode(canvasRef.current, barcodeValue, {
          format: 'CODE128',
          width: 2,
          height: 50,
          displayValue: true,
          fontSize: 14,
          margin: 10,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (error) {
        console.error('Error generating barcode preview:', error);
      }
    }
  }, [barcodeValue]);

  return (
    <div className="rounded-lg border-2 border-foreground/20 bg-white p-4 text-center">
      <div className="text-xs font-bold uppercase tracking-wide text-gray-600">
        {companyName}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-gray-500">
        COMANDA
      </div>
      <div className="my-2 rounded bg-black px-2 py-1 text-2xl font-bold text-white">
        #{number}
      </div>
      <div className="my-3 flex justify-center bg-white p-2">
        <canvas ref={canvasRef} className="max-w-full" />
      </div>
      <div className="text-[10px] text-gray-500">Valor: <strong>{barcodeValue}</strong></div>
      <div className="mt-1 text-[8px] text-gray-400">Escaneie para abrir esta comanda</div>
      <div className="mt-3 space-y-2">
        {[1, 2, 3].map((line) => (
          <div key={line} className="h-4 border-b border-dashed border-gray-300" />
        ))}
      </div>
    </div>
  );
}