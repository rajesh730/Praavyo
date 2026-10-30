'use client';

/**
 * "Download" saves a real PDF file. It never opens the print dialog.
 *
 * Each sheet on screen (a report card's `.cas-a4`, a certificate sheet) is
 * drawn to an image by the browser itself, so fonts, Nepali text and colours
 * come out as they look, and placed on its own A4 page.
 *
 * Screens that do not have the sheets on them load the print page in a hidden
 * frame with `download=1`; that page builds the PDF and hands it back here.
 */

const A4 = { width: 210, height: 297 };
const MESSAGE = 'pravyo-pdf';
const TIMEOUT_MS = 180000;

/** Build one PDF from `sheets` (one page each) and return it as a Blob. */
export async function buildPdf(sheets) {
  const nodes = [...sheets].filter(Boolean);
  if (!nodes.length) throw new Error('There is nothing to download.');

  const [{ toJpeg }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  await document.fonts?.ready;

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  for (const [index, node] of nodes.entries()) {
    // On a phone the sheet shrinks to the screen; lay it out at A4 to capture.
    node.classList.add('pdf-capture');
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const image = await toJpeg(node, {
      quality: 0.92,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      width,
      height,
      // Screen-only margin, shadow and fit-to-screen scaling are not part of the page.
      style: { margin: '0', boxShadow: 'none', transform: 'none' },
    }).finally(() => node.classList.remove('pdf-capture'));

    if (index > 0) pdf.addPage('a4', 'portrait');
    const scale = Math.min(A4.width / width, A4.height / height);
    const w = width * scale;
    const h = height * scale;
    pdf.addImage(image, 'JPEG', (A4.width - w) / 2, 0, w, h);
  }
  return pdf.output('blob');
}

export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = pdfName(fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Save the sheets currently on this page as one PDF file. */
export async function downloadSheets(sheets, fileName) {
  saveBlob(await buildPdf(sheets), fileName);
}

/**
 * Download the PDF of a print page without leaving the current screen.
 * `url` is the print page; `download=1` is added here.
 */
export function downloadPdfFromPage(url) {
  return new Promise((resolve, reject) => {
    const token = Math.random().toString(36).slice(2);
    const target = new URL(url, window.location.href);
    target.searchParams.set('download', '1');
    target.searchParams.set('pdfToken', token);
    target.searchParams.delete('print');

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    // Off screen but laid out at desktop width, so sheets keep their A4 size.
    Object.assign(frame.style, { position: 'fixed', left: '-12000px', top: '0', width: '1280px', height: '1000px', border: '0' });

    const finish = (error, data) => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      frame.remove();
      if (error) reject(error);
      else {
        saveBlob(data.blob, data.fileName);
        resolve();
      }
    };
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.type !== MESSAGE || data.token !== token) return;
      finish(data.error ? new Error(data.error) : null, data);
    };
    const timer = window.setTimeout(() => finish(new Error('The PDF took too long to prepare. Please try again.')), TIMEOUT_MS);

    window.addEventListener('message', onMessage);
    frame.src = target.toString();
    document.body.appendChild(frame);
  });
}

/**
 * Called by a print page opened with `download=1`: builds the PDF from its
 * sheets and returns it to the screen that asked, or saves it directly when
 * the page was opened on its own.
 */
export async function answerPdfRequest(sheets, fileName) {
  const token = new URLSearchParams(window.location.search).get('pdfToken');
  const parent = window.parent !== window ? window.parent : null;
  try {
    const blob = await buildPdf(sheets);
    if (parent && token) parent.postMessage({ type: MESSAGE, token, blob, fileName }, window.location.origin);
    else saveBlob(blob, fileName);
  } catch (error) {
    if (parent && token) parent.postMessage({ type: MESSAGE, token, error: error?.message || 'The PDF could not be made.' }, window.location.origin);
    else throw error;
  }
}

function pdfName(name) {
  const clean = String(name || 'document').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'document';
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}
