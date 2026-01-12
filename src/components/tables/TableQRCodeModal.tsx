import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Download, Loader2, Printer, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';

interface Table {
  id: string;
  table_number: number;
  name: string | null;
}

interface TableQRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tables: Table[];
  companySlug: string;
  companyName: string;
}

export function TableQRCodeModal({
  open,
  onOpenChange,
  tables,
  companySlug,
  companyName,
}: TableQRCodeModalProps) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  // Generate QR codes when modal opens
  useEffect(() => {
    if (!open || tables.length === 0) return;

    const generateQRCodes = async () => {
      setGenerating(true);
      const codes: Record<string, string> = {};

      for (const table of tables) {
        const url = `${window.location.origin}/menu/${companySlug}?mesa=${table.table_number}`;
        try {
          const dataUrl = await QRCode.toDataURL(url, {
            width: 300,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
          codes[table.id] = dataUrl;
        } catch (err) {
          console.error('Error generating QR code for table', table.table_number, err);
        }
      }

      setQrCodes(codes);
      setGenerating(false);
    };

    generateQRCodes();
  }, [open, tables, companySlug]);

  const getTableUrl = (tableNumber: number) => {
    return `${window.location.origin}/menu/${companySlug}?mesa=${tableNumber}`;
  };

  const handleCopyLink = async (tableId: string, tableNumber: number) => {
    try {
      await navigator.clipboard.writeText(getTableUrl(tableNumber));
      setCopiedId(tableId);
      toast({ title: 'Link copiado!' });
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  const downloadPDF = async () => {
    if (tables.length === 0) return;

    setGenerating(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      const qrSize = 60; // Size of QR code in mm
      const margin = 15;
      const cols = 3;
      const rows = 4;
      const cellWidth = (pageWidth - margin * 2) / cols;
      const cellHeight = (pageHeight - margin * 2) / rows;

      let currentPage = 0;
      let currentCol = 0;
      let currentRow = 0;

      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const qrDataUrl = qrCodes[table.id];

        if (!qrDataUrl) continue;

        // Calculate position
        const x = margin + currentCol * cellWidth + (cellWidth - qrSize) / 2;
        const y = margin + currentRow * cellHeight + 10;

        // Add company name header on first item of each page
        if (currentCol === 0 && currentRow === 0) {
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.text(companyName, pageWidth / 2, 10, { align: 'center' });
        }

        // Add QR code
        pdf.addImage(qrDataUrl, 'PNG', x, y, qrSize, qrSize);

        // Add table number below QR code
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        const tableLabel = table.name 
          ? `Mesa ${table.table_number} - ${table.name}`
          : `Mesa ${table.table_number}`;
        pdf.text(tableLabel, x + qrSize / 2, y + qrSize + 8, { align: 'center' });

        // Add instruction text
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Escaneie para fazer seu pedido', x + qrSize / 2, y + qrSize + 14, { align: 'center' });

        // Move to next position
        currentCol++;
        if (currentCol >= cols) {
          currentCol = 0;
          currentRow++;
          if (currentRow >= rows) {
            // Start new page if there are more tables
            if (i < tables.length - 1) {
              pdf.addPage();
              currentPage++;
              currentRow = 0;
            }
          }
        }
      }

      pdf.save(`qrcodes-mesas-${companySlug}.pdf`);
      toast({ title: 'PDF gerado com sucesso!' });
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast({ 
        title: 'Erro ao gerar PDF', 
        description: error.message, 
        variant: 'destructive' 
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            QR Codes das Mesas
          </DialogTitle>
          <DialogDescription>
            Imprima os QR codes para suas mesas. <strong>Importante:</strong> estes QR codes só funcionam quando a mesa está aberta. Ao abrir uma mesa, mostre o QR code da sessão ativa para o cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning about session-based QR codes */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">Como funciona:</p>
            <p className="text-amber-600 dark:text-amber-500 mt-1">
              1. Imprima estes QR codes e coloque nas mesas.<br />
              2. Quando o cliente escanear, será direcionado ao cardápio.<br />
              3. Para fazer pedidos na mesa, abra a mesa primeiro no sistema e compartilhe o link da sessão.
            </p>
          </div>

          {/* Action button */}
          <div className="flex justify-end">
            <Button onClick={downloadPDF} disabled={generating || tables.length === 0}>
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Baixar PDF com todos os QR Codes
            </Button>
          </div>

          {/* QR Code preview grid */}
          {generating ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Gerando QR codes...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {tables.map((table) => (
                <div 
                  key={table.id} 
                  className="flex flex-col items-center p-4 border rounded-lg bg-card"
                >
                  {qrCodes[table.id] ? (
                    <img 
                      src={qrCodes[table.id]} 
                      alt={`QR Code Mesa ${table.table_number}`}
                      className="w-32 h-32"
                    />
                  ) : (
                    <div className="w-32 h-32 bg-muted animate-pulse rounded" />
                  )}
                  <p className="mt-2 font-bold text-center">
                    Mesa {table.table_number}
                  </p>
                  {table.name && (
                    <p className="text-sm text-muted-foreground text-center">{table.name}</p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => handleCopyLink(table.id, table.table_number)}
                  >
                    {copiedId === table.id ? (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 mr-1" />
                        Copiar Link
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {tables.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma mesa cadastrada. Crie mesas primeiro para gerar os QR codes.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
