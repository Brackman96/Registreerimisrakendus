const pcsclite = require("pcsclite"); // PCSClite moodul NFC-lugejatega suhtlemiseks
const mysql = require("mysql2"); // MySQL moodul andmebaasi ühenduste jaoks
const express = require("express"); // Express moodul veebiserveri loomiseks
const path = require("path"); // Path moodul failisüsteemi radadega töötamiseks
const WebSocket = require("ws"); // WebSocket moodul reaalajas suhtluse jaoks
const ExcelJS = require("exceljs"); // ExcelJS moodul Exceli failide töötlemiseks
const fs = require("fs"); // Failisüsteemi moodul failide lugemiseks ja kirjutamiseks
const csv = require("csv-parser"); // CSV-parser CSV-failide töötlemiseks
const nodemailer = require("nodemailer"); // Nodemailer moodul e-kirjade saatmiseks
const cron = require('node-cron'); // Node-cron moodul ajastatud ülesannete jaoks
const { spawn } = require("child_process"); // Child_process moodul uute protsesside käivitamiseks

const pcsc = pcsclite(); // PCSClite objekt NFC-lugejate haldamiseks
const app = express(); // Express rakendus
const port = 3000; // HTTP serveri kuulamise port

const emailer = nodemailer.createTransport({
  service: "gmail", // E-posti teenus (Gmail)
  auth: {
    user: "", // Saatja e-posti aadress
    pass: "", // Saatja e-posti parool
  },
});

// Ajasta rakenduse taaskäivitamine iga päev kell 06:00
cron.schedule("0 6 * * *", () => {
    console.log("Restarting application...");

    // Käivita uus protsess rakenduse jaoks
    const subprocess = spawn("node", [process.argv[1]], {
        detached: true,  // Käivita protsess sõltumatult vanemast
        stdio: "inherit" // Päranda väljundid vanemprotsessilt
    });

    subprocess.unref(); // Lase vanemprotsessil väljuda ilma lapse ootamiseta
    process.exit(0);    // Välju praegusest protsessist
});

const students = {}; // Objekt õpilaste andmete hoidmiseks
function loadCsvToDictionary(filePath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath) // Loeb CSV-faili
      .pipe(csv()) // Töötleb CSV-sisu
      .on("data", (row) => {
        const { Isikukood, ...rest } = row;
        students[Isikukood] = rest; // Salvestab Isikukood võtmena
      })
      .on("end", () => {
        console.log("CSV file successfully processed."); // Märkib, et CSV töötlemine on lõpetatud
        resolve(students);
      })
      .on("error", (err) => {
        reject(`Error reading the CSV file: ${err}`); // Tõrke korral annab veateate
      });
  });
}

(async () => {
  try {
    const filePath = "students.csv"; // CSV-faili asukoht
    await loadCsvToDictionary(filePath); // Laeb õpilaste andmed CSV-st
  } catch (error) {
    console.error(error); // Tõrke logimine
  }
})();

// WebSocket serveri seadistamine
const wss = new WebSocket.Server({ port: 3001 });
wss.on("connection", (ws) => {
  console.log("WebSocket connection established."); // Märk, et WebSocket ühendus on loodud
  ws.on("close", () => console.log("WebSocket connection closed.")); // Märk, et WebSocket ühendus suleti
});

// Funktsioon andmete uuenduste edastamiseks WebSocket kaudu
function broadcastUpdate(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) { // Kontrollib, kas ühendus on avatud
      client.send(JSON.stringify(data)); // Saadab uuenduse
    }
  });
}

// MySQL andmebaasi ühendus
const db = mysql.createConnection({
  host: "", // Andmebaasi host
  user: "", // Kasutajanimi
  password: "", // Parool
  database: "student_registration", // Andmebaasi nimi
  timezone: "Z", // Ajavöönd
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err.message); // Väljastab veateate, kui ühendus ebaõnnestub
    process.exit(1); // Lõpetab protsessi tõrke korral
  }
  console.log("Connected to MySQL!"); // Teade eduka ühenduse korral
});

// Abifunktsioon tänase kuupäevaga tabeli nime saamiseks
const getTableName = () => {
  const today = new Date(); // Loob uue kuupäeva objekti
  return `students_${today.toISOString().split("T")[0].replace(/-/g, "_")}`; // Tagastab tabeli nime formaadis "students_AAAA_KK_PP"
};

// API lõpp-punkt, mis tagastab kõik õpilaste andmed
app.get("/api/students", (req, res) => {
  res.json(students); // Tagastab JSON-objekti, mis sisaldab õpilaste andmeid
});

// API lõpp-punkt kõigi tabelite hankimiseks
app.get("/api/tables", (req, res) => {
  db.query("SHOW TABLES LIKE 'students_%'", (err, results) => { // Küsib andmebaasist kõik tabelid, mille nimi algab "students_"
    if (err) {
      console.error("Error fetching tables:", err.message); // Logib vea, kui päring ebaõnnestub
      return res.status(500).json({ error: err.message }); // Tagastab veateate vastusena
    }

    const tables = results.map((row) => Object.values(row)[0]); // Loob massiivi tabelite nimedega
    const tableCountPromises = tables.map((table) => {
      return new Promise((resolve, reject) => {
        db.query(
          `SELECT COUNT(*) AS count FROM ??`, // Loendab kirjed igas tabelis
          [table],
          (err, countResults) => {
            if (err) {
              return reject(err); // Tagastab vea lubadusena
            }
            resolve({ table, count: countResults[0].count }); // Tagastab tabeli nime ja kirjete arvu
          }
        );
      });
    });

    Promise.all(tableCountPromises) // Ootab kõikide lubaduste täitumist
      .then((counts) => res.json(counts)) // Tagastab kõik tabelite arvestused JSON-vormingus
      .catch((err) => {
        console.error("Error fetching table counts:", err.message); // Logib vea, kui tabelite arvestuste päring ebaõnnestub
        res.status(500).json({ error: "Error fetching table counts" }); // Tagastab veateate vastusena
      });
  });
});

// API lõpp-punkt kirje kustutamiseks
app.delete("/api/records/:tableName/:id", (req, res) => {
  const { tableName, id } = req.params; // Võtab URL-i parameetrid (tabeli nimi ja ID)

  // Kontrollib tabeli nime ja ID formaati
  if (!/^students_\d{4}_\d{2}_\d{2}$/.test(tableName)) {
    return res.status(400).json({ error: "Invalid table name format" }); // Tagastab veateate, kui tabeli nimi on vigane
  }
  if (!id || isNaN(id)) {
    return res.status(400).json({ error: "Invalid ID" }); // Tagastab veateate, kui ID on vigane
  }

  db.query(`DELETE FROM ?? WHERE id = ?`, [tableName, id], (err, results) => {
    if (err) {
      console.error(
        `Error deleting record from table ${tableName}:`,
        err.message
      ); // Logib vea, kui kustutamine ebaõnnestub
      return res.status(500).json({ error: "Database error" }); // Tagastab veateate vastusena
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: "Record not found" }); // Tagastab veateate, kui kirjet ei leitud
    }
    console.log(`Record with ID ${id} deleted from table ${tableName}`); // Teavitab edukast kustutamisest
    res.status(200).json({ success: true }); // Tagastab eduteate vastusena
  });
});

// API lõpp-punkt konkreetse tabeli kirjete hankimiseks
app.get("/api/records/:tableName", (req, res) => {
  const { tableName } = req.params; // Võtab URL-i parameetrid (tabeli nimi)

  // Kontrollib tabeli nime formaati
  if (!/^students_\d{4}_\d{2}_\d{2}$/.test(tableName)) {
    return res.status(400).json({ error: "Invalid table name format" }); // Tagastab veateate, kui tabeli nimi on vigane
  }

  db.query(`SELECT * FROM ??`, [tableName], (err, results) => {
    if (err) {
      console.error(
        `Error fetching records for table ${tableName}:`,
        err.message
      ); // Logib vea, kui kirjete päring ebaõnnestub
      return res.status(500).json({ error: err.message }); // Tagastab veateate vastusena
    }
    res.json(results); // Tagastab tabeli kirjed JSON-vormingus
  });
});

// API: Lisa õpilane käsitsi
app.post("/api/manual-register", express.json(), (req, res) => {
    const { personalCode, tableName } = req.body; // Võtab päringust isikukoodi ja tabeli nime
  
    if (!personalCode || !tableName) {
      return res.status(400).json({ error: "Missing required fields" }); // Kontrollib, kas kõik vajalikud väljad on olemas
    }
  
    db.query(`SHOW TABLES LIKE ?`, [tableName], (err, results) => { // Kontrollib, kas tabel eksisteerib
      if (err) {
        console.error("Error checking table existence:", err.message); // Logib vea, kui päring ebaõnnestub
        return res.status(500).json({ error: "Database error" }); // Tagastab veateate vastusena
      }
  
      if (results.length === 0) {
        return res
          .status(400)
          .json({ error: `Table ${tableName} does not exist` }); // Tagastab veateate, kui tabelit ei leitud
      }
  
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace("T", " "); // Loob praeguse ajatempliga stringi
      const student =
        personalCode in students
          ? students[personalCode]
          : { Eesnimi: null, Perekonnanimi: null, Klass: null }; // Kontrollib, kas õpilane on juba olemas
      const name = student.Eesnimi
        ? `${student.Eesnimi} ${student.Perekonnanimi}`
        : null; // Loob õpilase nime või jätab selle nulliks
  
      // Lisab kirje tabelisse
      db.query(
        `INSERT INTO ?? (personalCode, name, klass, timestamp) VALUES (?, ?, ?, ?)`,
        [tableName, personalCode, name, student.Klass, timestamp],
        (err, results) => {
          if (err) {
            console.error("Error inserting student:", err.message); // Logib vea, kui lisamine ebaõnnestub
            return res.status(500).json({ error: "Database error" }); // Tagastab veateate
          }
          console.log("Student manually added:", results); // Logib eduka lisamise
          broadcastUpdate({}); // Teavitab teisi kliente uuendustest
          res.status(201).json({ success: true }); // Tagastab eduteate vastusena
        }
      );
    });
  });
  
  // Funktsioon Exceli faili genereerimiseks
  async function generateXlsx(tableName) {
    const workbook = new ExcelJS.Workbook(); // Loob uue Exceli töövihiku
    const worksheet = workbook.addWorksheet("Students"); // Lisab töölehe nimega "Students"
  
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 }, // Veerg ID jaoks
      { header: "Personal code", key: "personalCode", width: 30 }, // Veerg isikukoodi jaoks
      { header: "Name", key: "name", width: 30 }, // Veerg nime jaoks
      { header: "Class", key: "klass", width: 30 }, // Veerg klassi jaoks
      { header: "Timestamp", key: "timestamp", width: 15 }, // Veerg ajatemplite jaoks
    ];
  
    const results = await new Promise((resolve, reject) => {
      db.query("SELECT * FROM ??", [tableName], (err, results) => { // Küsib kõik kirjed tabelist
        if (err) return reject(err); // Tõrke korral tagastab vea
        resolve(results); // Edu korral tagastab tulemused
      });
    });
  
    results.forEach((row) => worksheet.addRow(row)); // Lisab kõik tulemused Exceli faili
  
    return await workbook.xlsx.writeBuffer(); // Tagastab Exceli faili puhvrina
  }
  
  // API: Ekspordi tabel Excelisse
  app.get("/api/export/:tableName", async (req, res) => {
    const { tableName } = req.params; // Võtab URL-i parameetri (tabeli nimi)
    try {
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ); // Määrab vastuse sisutüübi
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${tableName}.xlsx`
      ); // Määrab faili nime
      const buffer = await generateXlsx(tableName); // Genereerib Exceli faili
      res.send(buffer); // Saadab faili vastusena
    } catch (error) {
      console.error("Error exporting table to Excel:", error.message); // Logib vea
      res.status(500).json({ error: "Failed to export table to Excel" }); // Tagastab veateate
    }
  });
  
  // Funktsioon e-kirja saatmiseks koos Exceli manusega
  async function sendEmail(tableName, to) {
      const buffer = await generateXlsx(tableName); // Genereerib Exceli faili
  
      const results = await new Promise((resolve, reject) => {
          db.query("SELECT * FROM ??", [tableName], (err, results) => {
            if (err) return reject(err); // Tõrke korral tagastab vea
            resolve(results); // Edu korral tagastab tulemused
          });
        });
  
      const mailOptions = {
        from: "dave.magi1@gmail.com", // Saatja e-posti aadress
        to: to, // Saaja e-posti aadress
        subject: "Student registration", // E-kirja teema
        text: `TÃ¤na kÃ¤is sÃ¶Ã¶mas ${results.length} Ãµpilast`, // E-kirja sisu
        attachments: [
          {
            filename: `${tableName}.xlsx`, // Manuse nimi
            content: buffer, // Manuse sisu
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // Manuse tüüp
          },
        ],
      };
      emailer.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Error sending email:", error); // Logib vea, kui e-kirja saatmine ebaõnnestub
        } else {
          console.log("Email sent successfully:", info.response); // Logib eduka saatmise
        }
      });
  }
  
  // API: Ekspordi tabel e-kirja
  app.get("/api/email/:tableName/:to", async (req, res) => {
      const { tableName: tableNameFromParams, to } = req.params; // Võtab URL-i parameetrid (tabeli nimi ja saaja aadress)
    try {
      const tableName = tableNameFromParams ?? getTableName(); // Kasutab antud tabeli nime või loob selle
      await sendEmail(tableName, to); // Saadab e-kirja koos Exceli manusega
      res.status(200); // Määrab staatusekoodi edukaks
    } catch (error) {
      console.error("Error exporting table to Excel:", error.message); // Logib vea
      res.status(500).json({ error: "Failed to export table to Excel" }); // Tagastab veateate
    }
  });
  
  // Ajasta e-kirja saatmine iga päev kell 17:00
  cron.schedule('0 17 * * *', async () => {
      const tableName = getTableName(); // Loob tänase tabeli nime
      await sendEmail(tableName, 'dave.magi1@gmail.com'); // Saadab e-kirja
  });
  
  // NFC lugeja seadistamine
  const WRITE_AUTH = [
    
  ]; // Autentimisvõtme kirjutamise käsk
  const AUTH_SECTOR = [
    
  ]; // Sektori autentimise käsk
  const READ = []; // Lugemiskäsk
  
  pcsc.on("reader", (reader) => {
    console.log("Reader detected:", reader.name); // Märgib, et lugeja on tuvastatud
  
    reader.on("status", (status) => {
      const changes = reader.state ^ status.state; // Määrab olekumuutused
  
      if (changes & reader.SCARD_STATE_PRESENT) { // Kui kaart on sisestatud
        if (status.state & reader.SCARD_STATE_PRESENT) {
          console.log("Card inserted");
          reader.connect(
            { share_mode: reader.SCARD_SHARE_SHARED },
            (err, protocol) => {
              if (err) {
                console.error("Error connecting to card:", err); // Logib vea
                return;
              }
  
              const tableName = getTableName(); // Loob tabeli nime
              db.query(
                `
                          CREATE TABLE IF NOT EXISTS ${db.escapeId(tableName)} (
                              id INT AUTO_INCREMENT PRIMARY KEY,
                              personalCode VARCHAR(11) NOT NULL,
                              name VARCHAR(255) NULL,
                              klass VARCHAR(10) NULL,
                              timestamp DATETIME NOT NULL,
                              UNIQUE (personalCode)
                          )
                      `,
                (err) => {
                  if (err) {
                    console.error("Error ensuring table exists:", err.message); // Logib vea
                    return;
                  }
                }
              );
  
              reader.transmit(
                Buffer.from(WRITE_AUTH),
                255,
                protocol,
                (err, writeResponse) => {
                  if (err) {
                    console.error(
                      "Error writing authentication key to reader:",
                      err
                    ); // Logib vea
                    return;
                  }
  
                  reader.transmit(
                    Buffer.from(AUTH_SECTOR),
                    255,
                    protocol,
                    (err, authResponse) => {
                      if (err) {
                        console.error("Error authenticating sector:", err); // Logib vea
                        return;
                      }
  
                      const authCode = authResponse.toString("hex");
                      if (authCode === "9000") { // Kui autentimine on edukas
                        reader.transmit(
                          Buffer.from(READ),
                          255,
                          protocol,
                          (err, dataResponse) => {
                            if (err) {
                              console.error("Error reading data:", err); // Logib vea
                              return;
                            }
  
                            const cardData = dataResponse.toString("hex");
                            const personalCode = Buffer.from(
                              cardData.slice(0, -4),
                              "hex"
                            )
                              .toString("ascii")
                              .replace(/\0/g, ""); // Eemaldab nullmärgid
                            const now = new Date();
                            const timestamp = now
                              .toISOString()
                              .slice(0, 19)
                              .replace("T", " "); // Loob ajatempliga stringi
                            const student =
                              personalCode in students
                                ? students[personalCode]
                                : {
                                    Eesnimi: null,
                                    Perekonnanimi: null,
                                    Klass: null,
                                  }; // Kontrollib, kas õpilane on olemas
                            const name = student.Eesnimi
                              ? `${student.Eesnimi} ${student.Perekonnanimi}`
                              : null; // Loob nime
  
                            db.query(
                              `INSERT INTO ${db.escapeId(
                                tableName
                              )} (personalCode, name, klass, timestamp) VALUES (?, ?, ?, ?)`,
                              [personalCode, name, student.Klass, timestamp],
                              (err, results) => {
                                if (err) {
                                  console.error("Database error:", err.message); // Logib vea
                                } else {
                                  console.log(
                                    "Data inserted into database:",
                                    results
                                  ); // Logib eduka lisamise
                                  broadcastUpdate({
                                    personalCode,
                                    name,
                                    timestamp: now,
                                    klass: student.Klass,
                                  }); // Teavitab teisi kliente uuendustest
                                }
                              }
                            );
                          }
                        );
                      }
                    }
                  );
                }
              );
            }
          );
        }
      }
  
      if (changes & reader.SCARD_STATE_EMPTY) { // Kui kaart eemaldati
        console.log("Card removed");
        reader.disconnect(reader.SCARD_LEAVE_CARD, () => {
          console.log("Reader reset after card removal."); // Logib lugeja lähtestamise
        });
      }
    });
  
    reader.on("end", () => {
      console.log("Reader disconnected:", reader.name); // Logib lugeja lahtiühendamise
    });
  
    reader.on("error", (err) => {
      console.error("Reader error:", err.message); // Logib lugeja vea
      reader.disconnect(reader.SCARD_RESET_CARD, () => {
        console.log("Reader reset due to error."); // Logib lugeja lähtestamise tõrke korral
      });
    });
  });
  
  pcsc.on("error", (err) => {
    console.error("PC/SC error:", err.message); // Logib üldised PC/SC vead
  });
  
  // Serveeri staatilised esipaneeli failid
  app.use(express.static(path.join(__dirname, "public"))); // Määrab staatiliste failide kausta
  
  // Käivita HTTP server
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`); // Logib serveri käivitumise ja aadressi
  });  