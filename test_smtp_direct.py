import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

def test_smtp():
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    recipient = os.environ.get("REPORT_RECIPIENT", "d.trujillo@brancoindustries.com")

    print(f"🚀 Probando conexión SMTP a {host}:{port}...")
    print(f"📧 Remitente: {user}")
    print(f"📩 Destinatario: {recipient}")

    if not user or not password:
        print("❌ Error: SMTP_USER o SMTP_PASS no configurados en .env")
        return

    msg = MIMEMultipart()
    msg["Subject"] = "PRUEBA CRITICA SISTEMA CTPAT"
    msg["From"] = user
    msg["To"] = recipient
    msg.attach(MIMEText("Esta es una prueba directa para verificar las credenciales SMTP configuradas.", "plain"))

    try:
        server = smtplib.SMTP(host, port)
        server.set_debuglevel(1)
        server.ehlo()
        server.starttls()
        server.login(user, password)
        server.sendmail(user, [recipient], msg.as_string())
        server.quit()
        print("\n✅ CORREO ENVIADO EXITOSAMENTE.")
    except Exception as e:
        print(f"\n❌ ERROR AL ENVIAR CORREO: {e}")

if __name__ == "__main__":
    test_smtp()
