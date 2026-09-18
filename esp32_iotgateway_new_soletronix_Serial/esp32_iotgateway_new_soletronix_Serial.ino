// ============================================================================
// ESP32 IoT GATEWAY - SOLETRONIX (USB-WIRED, NO WIFI, NO SD)
// ============================================================================
// RECEIVE: unchanged from esp32_iotgateway_old_code_working.ino. The sensor
//          board talks to Serial2 exactly as it always has, and the parsing,
//          LCD display and timing (including the 5 s LCD hold) are the same.
// SEND:    over USB Serial to the Raspberry Pi as one JSON line per reading.
//          The Pi's serial listener forwards it to the local dashboard.
//          There is no Wi-Fi, no HTTP, no SD card, no backlog: the Pi stores
//          everything and syncs to the cloud itself.
//
// RULE: the ONLY thing that may be printed to Serial starting with "{" is the
//       reading payload from sendToPi(). Lines starting with "#" are
//       diagnostics: the Pi's serial listener writes them to its log and
//       otherwise ignores them. Raw JSON echoes are not allowed.
//
// RECEIVE ROBUSTNESS (added after "sends once per reset" in the field):
//   The old readString() returns only after 1 s of silence. A sensor board
//   that sends with gaps shorter than that never lets it return, and the
//   gateway sits inside it forever — one reading gets through right after a
//   reset, then nothing. It also parsed the whole buffer, so any stray byte in
//   front of the JSON ("P1", half a line, noise) failed the read outright.
//
//   Now the loop reads Serial2 one byte at a time and captures from '{' to
//   the matching '}' — never blocking, never depending on line endings or
//   pauses, never confused by what came before the brace. Whatever the board
//   sent during the 5 s LCD hold is discarded afterwards so the next capture
//   starts clean. A "# idle" line every 30 s of silence tells the Pi log
//   whether the board stopped talking or the gateway stopped listening.
// ============================================================================

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "GravityRtc.h"
#include <ArduinoJson.h>

// -------------------------------------------- PERIPHERALS ------------------

LiquidCrystal_I2C lcd(0x27, 20, 4);
GravityRtc rtc;
// ArduinoJson 7: JsonDocument grows as needed. The old firmware's
// DynamicJsonDocument(200) is deprecated and slated for removal; for the
// sensor board's ~80-byte payload the two behave identically.
JsonDocument jsonDoc;

// ------------------------------------------ GLOBAL VARIABLES ---------------

int pnd;
float rtd;
float ph;
float sal;
float dox;

unsigned long lastRxMs = 0;      // last time anything arrived on Serial2
unsigned long lastIdleNoteMs = 0;
const unsigned long IDLE_NOTE_MS = 30000;

// Byte-level capture of one {...} message from the sensor board.
const int RX_MAX = 240;
char rxBuf[RX_MAX + 1];
int rxLen = 0;
int rxDepth = 0;                 // brace depth; a message ends when it returns to 0
char textBuf[8];                 // for short plain-text commands like "P1"
int textLen = 0;

// ============================================================================

void setup()
{
  Serial.begin(9600); // USB link to the Pi. Must match SERIAL_BAUD on the Pi.
  lcd.init();
  lcd.backlight();

  lcd.setCursor(0, 0);
  lcd.print("USB Mode - No WiFi");
  delay(1000);

  rtc.setup();
  rtc.read();
  delay(1000);
  Serial2.begin(9600); // sensor board — unchanged
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Finished Set-up");
  delay(2000);
  lcd.clear();
  delay(3000);
  lastRxMs = millis();
  lastIdleNoteMs = millis();
  Serial.println("# gateway ready");
}

// Drop anything queued on Serial2. Called after the LCD hold so the next
// capture starts on a fresh message, not on the tail of an old one.
void flushSerial2()
{
  int dropped = 0;
  while (Serial2.available())
  {
    Serial2.read();
    dropped++;
  }
  if (dropped > 0)
  {
    Serial.print("# flushed ");
    Serial.print(dropped);
    Serial.println(" stale bytes");
  }
}

// ============================================================================

void loop()
{
  // Drain everything that has arrived, one byte at a time. Returns as soon as
  // a complete {...} has been handled so the LCD hold does not stall the read.
  while (Serial2.available())
  {
    char c = (char)Serial2.read();
    lastRxMs = millis();

    if (rxDepth == 0 && c != '{')
    {
      // Outside a message: collect a short plain-text command, if any.
      if (c == '\n' || c == '\r')
      {
        textBuf[textLen] = '\0';
        if (textLen == 2 && (textBuf[0] == 'P' || textBuf[0] == 'p') && textBuf[1] == '1')
        {
          lcd.clear();
          lcd.setCursor(0, 2);
          lcd.print("Requesting Data");
        }
        else if (textLen > 0)
        {
          Serial.print("# ignored: ");
          Serial.println(textBuf);
        }
        textLen = 0;
      }
      else if (textLen < 7)
      {
        textBuf[textLen++] = c;
      }
      continue;
    }

    // Inside (or starting) a message.
    if (c == '{')
    {
      if (rxDepth == 0) rxLen = 0;
      rxDepth++;
    }
    if (rxLen < RX_MAX)
    {
      rxBuf[rxLen++] = c;
    }
    else
    {
      Serial.println("# overflow: message longer than 240 bytes, dropped");
      rxDepth = 0;
      rxLen = 0;
      continue;
    }
    if (c == '}')
    {
      rxDepth--;
      if (rxDepth <= 0)
      {
        rxDepth = 0;
        rxBuf[rxLen] = '\0';
        handleMessage(String(rxBuf));
        rxLen = 0;
        textLen = 0;
        break; // one reading per loop pass
      }
    }
  }

  if (!Serial2.available() && millis() - lastIdleNoteMs >= IDLE_NOTE_MS)
  {
    lastIdleNoteMs = millis();
    Serial.print("# idle: no data from sensor board for ");
    Serial.print((millis() - lastRxMs) / 1000);
    Serial.println(" s");
  }

  delay(20);
}

// One complete {...} from the sensor board.
void handleMessage(const String &extractedString)
{
  Serial.print("# rx json ");
  Serial.print(extractedString.length());
  Serial.println(" bytes");

  DeserializationError error = deserializeJson(jsonDoc, extractedString);

  if (error)
  {
    Serial.print("# parse error: ");
    Serial.println(error.c_str());
    displayLCDError();
  }
  else
  {
    // ---- unchanged from the old firmware: LCD, 5 s hold, RTC --------------
    deserializeToJSON();
    delay(200);
    printToLCD();
    delay(5000);
    rtc.read();

    // ---- SEND: replaces the SD-card + Wi-Fi block ------------------------
    sendToPi(extractedString);
  }

  // Whatever arrived during the hold is stale and may be cut mid-message;
  // start the next capture clean.
  flushSerial2();
}

// ============================================================================
// SEND OVER USB SERIAL
// ============================================================================
// Same second parse of the extracted JSON and the same sprintf the old
// firmware used for the HTTP body, so the payload the Pi receives is
// byte-for-byte what the cloud used to receive.

void sendToPi(const String &extractedString)
{
  DeserializationError error2 = deserializeJson(jsonDoc, extractedString);

  if (error2)
  {
    lcd.clear();
    lcd.setCursor(0, 2);
    lcd.print("Data Invalid");
    lcd.setCursor(0, 3);
    lcd.print("Data not Sent");
    return;
  }

  float pnd = jsonDoc["pnd"];
  float rtd = jsonDoc["rtd"];
  float ph = jsonDoc["ph"];
  float sal = jsonDoc["sal"];
  float dox = jsonDoc["dox"];

  char jsonString[100];
  sprintf(jsonString, "{\"data\":{\"pnd\":%.2f,\"rtd\":%.2f,\"ph\":%.2f,\"sal\":%.2f,\"dox\":%.2f}}", pnd, rtd, ph, sal, dox);
  Serial.println(jsonString);

  lcd.setCursor(0, 3);
  lcd.print("Sent to Pi (USB)");
}

// ============================================================================
// LCD — unchanged from the old firmware
// ============================================================================

void printToLCD()
{
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("TP:");
  lcd.setCursor(3, 0);
  lcd.print(rtd);

  lcd.setCursor(0, 1);
  lcd.print("PH:");
  lcd.setCursor(3, 1);
  lcd.print(ph);

  lcd.setCursor(9, 0);
  lcd.print("SL:");
  lcd.setCursor(12, 0);
  lcd.print(sal);

  lcd.setCursor(8, 1);
  lcd.print("DO:");
  lcd.setCursor(11, 1);
  lcd.print(dox);

  lcd.setCursor(0, 2);
  lcd.print("Json Parse Success");
}

void displayLCDError()
{
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Json String Fail");
}

// ============================================================================
// JSON → globals — unchanged
// ============================================================================

void deserializeToJSON()
{
  pnd = jsonDoc["pnd"];
  rtd = jsonDoc["rtd"];
  ph = jsonDoc["ph"];
  sal = jsonDoc["sal"];
  dox = jsonDoc["dox"];
}

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx---END OF CODE---xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
