### **Installatsioonijuhend rakenduse käivitamiseks**

---

#### **1. Süsteeminõuded**
- Node.js versioon **16 või uuem**.
- MySQL server (käivitatud ja konfigureeritud).
- Brauser veebirakenduse kasutamiseks.

---

#### **2. Rakenduse allalaadimine**
Klooni projekt GitHubist või laadi see alla käsitsi:
```bash
git clone <projekti-url>
cd <projekti-kaust>
```

---

#### **3. Vajalikud Node.js moodulid**
Veendu, et järgnevad moodulid oleksid installitud. Need paigaldatakse automaatselt, kui käivitad käsu `npm install`:

- **pcsclite**: NFC lugejatega suhtlemiseks.
- **mysql2**: MySQL andmebaasiga ühenduse loomiseks.
- **express**: HTTP serveri ja API-de loomiseks.
- **path**: Failisüsteemiga töötamiseks (sisseehitatud Node.js moodul).
- **ws (WebSocket)**: Reaalajas suhtlemiseks serveri ja kliendi vahel.
- **exceljs**: Exceli failide genereerimiseks.
- **fs (File System)**: Failide lugemiseks ja kirjutamiseks (sisseehitatud Node.js moodul).
- **csv-parser**: CSV failide töötlemiseks.
- **nodemailer**: E-kirjade saatmiseks.
- **node-cron**: Ajastatud ülesannete (cron) käivitamiseks.

Paigalda kõik moodulid:
```bash
npm install
```

---

#### **4. MySQL andmebaasi seadistamine**
1. Logi MySQL serverisse:
   ```bash
   mysql -u root -p
   ```
2. Loo andmebaas:
   ```sql
   CREATE DATABASE student_registration;
   ```
3. Konfigureeri `server.js` failis andmebaasiühendus (vajadusel):
   - Muuda `host`, `user`, ja `password` väärtused oma seadistustele vastavaks:
     ```javascript
     const db = mysql.createConnection({
       host: "127.0.0.1", // Andmebaasi host
       user: "root",      // Kasutajanimi
       password: "Kuusepuu123!", // Parool
       database: "student_registration", // Andmebaasi nimi
       timezone: "Z",
     });
     ```

---

#### **5. CSV-faili lisamine**
Aseta `students.csv` fail rakenduse juurkausta. Fail peaks sisaldama õpilaste andmeid järgmises formaadis:
```csv
Isikukood,Eesnimi,Perekonnanimi,Klass
12345678901,John,Doe,10A
12345678902,Jane,Doe,10B
```

---

#### **6. Rakenduse käivitamine**
Käivita server:
```bash
node server.js
```

---

#### **7. Rakenduse kasutamine**
1. Ava brauser ja sisesta:
   ```
   http://localhost:3000
   ```
2. **Põhifunktsioonid:**
   - **Õpilaste lisamine:** Vali nimi nimekirjast ja vajuta "Lisa Õpilane".
   - **Tabelite eksport:** Kasuta "Saada Excel Fail Mailile" nuppu, et eksportida andmed Exceli formaadis.
   - **Live update:** Tabelid ja numbrid uuenevad reaalajas.

---

#### **8. Automatiseeritud toimingud**
- **Taaskäivitamine:** Rakendus taaskäivitub iga päev kell **06:00**.
- **E-kirja saatmine:** Exceli fail saadetakse iga päev kell **17:00** eelkonfigureeritud e-posti aadressile.

---

#### **9. Frontendi kohandamine**
Kui soovid muuta frontendi, ava ja muuda faili `index.html`. Fail asub kaustas `public/`.

---

Kui tekib probleeme installimise või kasutamisega, anna teada!