/*
 * ============================================================
 * GOOGLE APPS SCRIPT — Email Sender for Admin Panel
 * ============================================================
 * 
 * HOW TO SET UP:
 * 
 * 1. Go to https://script.google.com
 * 2. Click "New Project"
 * 3. Delete the default code and paste EVERYTHING below the dashed line
 * 4. Click "Deploy" → "New deployment"
 * 5. Choose type: "Web app"
 * 6. Set:
 *    - Description: "Portfolio Email Sender"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 7. Click "Deploy" and authorize with your Google account
 * 8. Copy the Web App URL
 * 9. Paste it into admin/env.js as SEND_EMAIL_URL
 *
 * That's it! The Send button will now send emails directly.
 * ============================================================
 */

// ──────────── COPY FROM HERE ────────────

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    var to = data.to;
    var subject = data.subject;
    var body = data.body;
    var senderName = data.senderName || 'Sriram Kannan';
    
    if (!to || !subject || !body) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Missing required fields: to, subject, body' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Send the email from your Gmail account
    GmailApp.sendEmail(to, subject, body, {
      name: senderName
    });
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: 'Email sent successfully to ' + to }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle CORS preflight
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'Email service is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ──────────── COPY UNTIL HERE ────────────
