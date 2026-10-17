/**
 * IA Studio - e-mail post-achat
 *
 * Déployer ce script comme application Web depuis le compte Gmail expéditeur.
 * Les valeurs sensibles et l'identifiant du PDF sont configurés dans les
 * propriétés du script, jamais directement dans ce fichier.
 */
function doPost(e) {
  try {
    const input = JSON.parse(e.postData.contents || '{}');
    const props = PropertiesService.getScriptProperties();
    const expectedToken = props.getProperty('MAIL_SHARED_SECRET');
    if (!expectedToken || input.token !== expectedToken) return reply({ ok: false, error: 'unauthorized' });

    const email = String(input.email || '').trim();
    const name = String(input.customerName || 'Bonjour').trim();
    const orderNumber = String(input.orderNumber || '').trim();
    const project = String(input.project || 'ton projet').trim();
    const guideId = props.getProperty('GUIDE_FILE_ID');
    if (!email || !orderNumber || !guideId) return reply({ ok: false, error: 'missing_configuration' });

    const guide = DriveApp.getFileById(guideId).getBlob().setName('Guide post-achat IA Studio.pdf');
    const subject = `IA Studio - ton accès est prêt (${orderNumber})`;
    const text = `Bonjour ${name},\n\nTon paiement a été confirmé. Tu trouveras en pièce jointe ton guide IA Studio.\n\nNuméro de commande : ${orderNumber}\nProjet indiqué : ${project}\n\nPour ton appel individuel de 60 minutes sur Zoom ou Discord, réponds à cet e-mail avec ton numéro de commande et tes disponibilités. Tu peux aussi écrire à dinotopius@gmail.com en indiquant ce numéro.\n\nÀ bientôt,\nIA Studio`;
    const html = `<div style="font-family:Arial,sans-serif;color:#12141a;line-height:1.6"><p>Bonjour ${escapeHtml(name)},</p><p>Ton paiement a été confirmé. Ton <strong>guide IA Studio</strong> est joint à cet e-mail.</p><div style="background:#f3f3ef;padding:16px;border-left:4px solid #b7e92c"><strong>Numéro de commande :</strong> ${escapeHtml(orderNumber)}<br><strong>Projet indiqué :</strong> ${escapeHtml(project)}</div><p>Pour ton appel individuel de 60 minutes sur Zoom ou Discord, réponds à cet e-mail avec ton numéro de commande et tes disponibilités. Tu peux aussi écrire à <a href="mailto:dinotopius@gmail.com">dinotopius@gmail.com</a>.</p><p>À bientôt,<br><strong>IA Studio</strong></p></div>`;
    MailApp.sendEmail({ to: email, subject: subject, body: text, htmlBody: html, name: 'IA Studio', replyTo: 'dinotopius@gmail.com', attachments: [guide] });
    return reply({ ok: true });
  } catch (error) { return reply({ ok: false, error: 'send_failed' }); }
}

function reply(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
