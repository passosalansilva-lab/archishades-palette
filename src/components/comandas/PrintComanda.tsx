import { useRef, useCallback, useEffect } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ComandaItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  options: any;
  notes: string | null;
}

interface Comanda {
  id: string;
  number: number;
  customer_name: string | null;
  customer_phone: string | null;
  status: 'open' | 'closed' | 'cancelled';
  notes: string | null;
  created_at: string;
  closed_at: string | null;
  total: number;
}

interface PrintComandaProps {
  comanda: Comanda;
  items: ComandaItem[];
  companyName?: string;
  variant?: 'button' | 'icon';
  onPrint?: () => void;
}

export function PrintComanda({
  comanda,
  items,
  companyName = 'Estabelecimento',
  variant = 'button',
  onPrint,
}: PrintComandaProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handlePrint = useCallback(() => {
    const printContent = printRef.current;
    if (!printContent) return;

    const html = printContent.innerHTML;

    const styles = `
      <style>
        @page {
          size: 80mm auto;
          margin: 0;
        }
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px;
          width: 80mm;
          padding: 5mm;
          line-height: 1.4;
        }
        .header {
          text-align: center;
          border-bottom: 2px dashed #000;
          padding-bottom: 10px;
          margin-bottom: 10px;
        }
        .company-name {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 4px;
        }
        .comanda-number {
          font-size: 28px;
          font-weight: bold;
          padding: 8px;
          margin: 8px 0;
          background: #000;
          color: #fff;
        }
        .comanda-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        .date {
          font-size: 10px;
          color: #666;
          margin-top: 4px;
        }
        .customer-section {
          text-align: center;
          padding: 8px;
          margin: 10px 0;
          border: 1px dashed #000;
        }
        .customer-name {
          font-size: 16px;
          font-weight: bold;
        }
        .customer-phone {
          font-size: 11px;
          color: #666;
        }
        .section {
          margin: 10px 0;
          padding: 8px 0;
          border-bottom: 1px dashed #000;
        }
        .section-title {
          font-weight: bold;
          margin-bottom: 6px;
          text-transform: uppercase;
          font-size: 11px;
        }
        .item {
          margin: 8px 0;
          padding-bottom: 6px;
          border-bottom: 1px dotted #ccc;
        }
        .item:last-child {
          border-bottom: none;
        }
        .item-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .item-qty {
          font-weight: bold;
          font-size: 14px;
          min-width: 30px;
        }
        .item-name {
          flex: 1;
          font-weight: bold;
        }
        .item-price {
          text-align: right;
          font-weight: bold;
        }
        .item-options {
          font-size: 10px;
          color: #666;
          margin-left: 30px;
          margin-top: 2px;
        }
        .item-notes {
          font-size: 10px;
          font-style: italic;
          margin-left: 30px;
          color: #333;
          margin-top: 2px;
        }
        .totals {
          margin-top: 12px;
          padding-top: 8px;
          border-top: 2px dashed #000;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          margin: 4px 0;
        }
        .grand-total {
          font-weight: bold;
          font-size: 18px;
          padding: 8px;
          margin-top: 6px;
          background: #f0f0f0;
        }
        .footer {
          text-align: center;
          margin-top: 15px;
          padding-top: 10px;
          border-top: 2px dashed #000;
          font-size: 10px;
          color: #666;
        }
        .qr-placeholder {
          width: 60px;
          height: 60px;
          border: 1px dashed #ccc;
          margin: 10px auto;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8px;
          color: #999;
        }
        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: bold;
          text-transform: uppercase;
          margin-top: 4px;
        }
        .status-open {
          background: #d4edda;
          color: #155724;
        }
        .status-closed {
          background: #e2e3e5;
          color: #383d41;
        }
      </style>
    `;

    const iframe = getOrCreateIframe();
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Comanda #${comanda.number}</title>
          ${styles}
        </head>
        <body>
          ${html}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      onPrint?.();
    }, 150);
  }, [comanda.number, getOrCreateIframe, onPrint]);

  return (
    <>
      {variant === 'button' ? (
        <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" />
          Imprimir Comanda
        </Button>
      ) : (
        <Button variant="ghost" size="icon" onClick={handlePrint} title="Imprimir comanda">
          <Printer className="h-4 w-4" />
        </Button>
      )}

      {/* Hidden print content */}
      <div className="hidden">
        <div ref={printRef}>
          {/* Header */}
          <div className="header">
            <div className="company-name">{companyName}</div>
            <div className="comanda-label">COMANDA</div>
            <div className="comanda-number">#{comanda.number}</div>
            <div className="date">
              {format(new Date(comanda.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </div>
            <div className={`status-badge ${comanda.status === 'open' ? 'status-open' : 'status-closed'}`}>
              {comanda.status === 'open' ? 'ABERTA' : comanda.status === 'closed' ? 'FECHADA' : 'CANCELADA'}
            </div>
          </div>

          {/* Customer */}
          {(comanda.customer_name || comanda.customer_phone) && (
            <div className="customer-section">
              {comanda.customer_name && (
                <div className="customer-name">{comanda.customer_name}</div>
              )}
              {comanda.customer_phone && (
                <div className="customer-phone">Tel: {comanda.customer_phone}</div>
              )}
            </div>
          )}

          {/* Items */}
          {items.length > 0 && (
            <div className="section">
              <div className="section-title">Itens Consumidos</div>
              {items.map((item) => {
                const options = Array.isArray(item.options) ? item.options : [];
                return (
                  <div key={item.id} className="item">
                    <div className="item-header">
                      <span className="item-qty">{item.quantity}x</span>
                      <span className="item-name">{item.product_name}</span>
                      <span className="item-price">{formatCurrency(item.total_price)}</span>
                    </div>
                    {options.length > 0 && (
                      <div className="item-options">
                        + {options.map((o: any) => o.name).join(', ')}
                      </div>
                    )}
                    {item.notes && (
                      <div className="item-notes">Obs: {item.notes}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Totals */}
          <div className="totals">
            <div className="total-row">
              <span>Qtd. Itens:</span>
              <span>{items.reduce((sum, i) => sum + i.quantity, 0)}</span>
            </div>
            <div className="total-row grand-total">
              <span>TOTAL:</span>
              <span>{formatCurrency(comanda.total)}</span>
            </div>
          </div>

          {/* Notes */}
          {comanda.notes && (
            <div className="section">
              <div className="section-title">Observações</div>
              <p>{comanda.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="footer">
            <p>Confira os itens antes de pagar</p>
            <p>Obrigado pela preferência!</p>
          </div>
        </div>
      </div>
    </>
  );
}
