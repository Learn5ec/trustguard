import { pdf } from '@react-pdf/renderer';
import { TrustGuardPdfDocument } from './PdfDocument';
import type { PackageAnalysisData, AnalysisReport, TokenUsage } from '../../types/analysis';

export async function generateAndDownloadPdf(
  data: Partial<PackageAnalysisData>,
  report: Partial<AnalysisReport> | null,
  tokenUsage?: TokenUsage | null
): Promise<void> {
  const doc = TrustGuardPdfDocument({ data, report, tokenUsage });
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trustguard-${data.packageName || 'report'}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
