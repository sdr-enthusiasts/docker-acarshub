// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

import { useEffect } from "react";
import safariImage from "../assets/images/safari.png";
import { Card } from "../components/Card";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";

/**
 * AboutPage Component
 * Displays comprehensive help and information about ACARS Hub
 */
export const AboutPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const version = useAppStore((state) => state.version);

  useEffect(() => {
    setCurrentPage("About");
    socketService.notifyPageChange("About");
  }, [setCurrentPage]);

  return (
    <div className="page about-page">
      <div className="page__header">
        <div>
          <h1 className="page__title">ACARS Hub About/Help</h1>
          <p className="page__subtitle">
            Open source ACARS/VDLM2 reception, feeding, and viewing
          </p>
        </div>
      </div>

      <div className="page__content">
        {/* About Section */}
        <Card title="About ACARS Hub" variant="info">
          <p>
            ACARS Hub is a collaborative, open source effort to easily enable
            reception of, feeding to{" "}
            <a
              href="http://airframes.io"
              target="_blank"
              rel="noopener noreferrer"
            >
              Airframes.io
            </a>
            , and local viewing of VDLM2/ACARS messages.
          </p>
        </Card>

        {/* Navigation Overview */}
        <Card title="Main Pages" variant="default">
          <p>There are three main pages you can interact with:</p>
          <ol>
            <li>
              <strong>Live Messages</strong>: This page will show you a rolling,
              constantly updated, list of up to the 50 most recent live messages
              as they come in. You can filter out messages that do not contain
              any information (the{" "}
              <code>Filter Out 'No Text' Messages/Show 'No Text' Messages</code>{" "}
              link on the right side), as well as pause the page update so you
              can catch up with messages.
            </li>
            <li>
              <strong>Live Map</strong>: If you have enabled ADSB this link will
              be available to you. You can see live ADSB targets from your local
              tar1090 instance, with targets that have ACARS messages
              highlighted in a circle.
            </li>
            <li>
              <strong>Search Database</strong>: If you want to look for
              interesting messages from the past you can use this page to have a
              look. On the right side, the <code>Most Recent Messages</code>{" "}
              will provide a look at your messages in chronological order, most
              recent first. Otherwise, you can use the provided search form to
              select the field you are interested in searching and the term to
              look for.
            </li>
            <li>
              <strong>Statistics</strong>: This page will provide an insight
              into the data you've collected.
            </li>
            <li>
              <strong>Alerts</strong>: Use this page to provide ACARS Hub words
              in the message body, flight (aka callsign), tail number or ICAO
              transponder codes that you want to monitor. Please see the Alerts
              section below for more information.
            </li>
            <li>
              <strong>System Status</strong>: On the page footer you will find
              text/link that shows the status of the underlying ACARS Hub system
              status. If you click on the link you will see a breakdown of each
              of the components ACARS Hub uses under the hood to get its work
              done and if there are any problems with it. It is normal for the
              system to show a fault for ACARS/VDLM receiving messages if you
              just started the container - give it a minute to see if it starts
              working. If any other bit shows a fault after container start that
              means something isn't right. See below for getting help if you get
              stuck.
            </li>
          </ol>
        </Card>

        {/* What is ACARS */}
        <Card title="What is ACARS">
          <p>
            ACARS is a pretty cool technology and these planes are sending an
            awful lot of information in a coded way. We are constantly working,
            along with the folks at{" "}
            <a
              href="http://airframes.io"
              target="_blank"
              rel="noopener noreferrer"
            >
              Airframes.io
            </a>
            , to decode the messages in a more refined, human-readable way. This
            is an on-going project so expect to see both decoded and non-decoded
            messages.
          </p>
          <p>
            We've made an effort to provide a maximum amount of information
            about the message in a compact, yet readable, way. Below is a list
            of terms/acronyms used throughout the web app and what they
            represent.
          </p>
          <p>
            Not all messages will include every field, but the fields received
            for that message will be displayed.
          </p>
        </Card>

        {/* Field Definitions */}
        <Card title="Message Field Definitions">
          <ol>
            <li>
              <strong>To Address</strong> or <strong>From Address</strong>: This
              is a unique address for the ground station that originated the
              message (in the case of a <code>From</code> message) or the
              address of the ground station meant to receive the message in the
              case of an aircraft originated message. If the ground station ID
              is recognized, we also display the name/location of the station as{" "}
              <code>To/From Address Station ID</code>.
            </li>
            <li>
              <strong>ICAO</strong>: This is a unique address for the aircraft
              that is sending/receiving the message.
            </li>
            <li>
              <strong>F</strong>/<strong>Frequency</strong>: This is the
              frequency that the message was received on.
            </li>
            <li>
              <strong>M</strong>/<strong>Mode</strong>: A code generally used to
              indicate the indicated 'country' or intended recipient of the
              message.
            </li>
            <li>
              <strong>L</strong>/<strong>Label</strong>: A code used to indicate
              the contents of the message. The list is really long, but common
              ones indicate a request for airport ATIS, position report, among
              many many others. On the <code>Live Message</code> page there is a
              menu under <code>Filter Message Labels</code> to exclude certain
              message labels from being shown.
            </li>
            <li>
              <strong>B</strong>/<strong>Block ID</strong>: Used to assist the
              stations in decoding message.
            </li>
            <li>
              <strong>M#</strong>/<strong>Message Number</strong>: A sequential
              combination of numbers and letters used to indicate a multi-part
              message, and what the correct order of the messages is.
            </li>
            <li>
              <strong>R</strong>/<strong>Response</strong>: Used by the
              sender/transmitter to indicate if the message was received
              properly, or if re-transmission is necessary.
            </li>
            <li>
              <strong>E</strong>/<strong>Error</strong>: The inclusion of this
              field on the website indicates the decoder successfully decoded
              part of a message, but there was an error in at least one field
              that it wasn't able to decode. The parts of the message that were
              decoded are displayed, but there will be missing fields.
            </li>
          </ol>
          <p>
            Additionally, some fields include a tool-tip if they include extra
            information (such as the <code>Flight</code> field if the web app
            was able to decipher the airline name), or if the field name is
            abbreviated (such as the <code>Mode</code> field), the tool-tip will
            give the full name of the field.
          </p>
        </Card>

        {/* General Tips */}
        <Card title="General Tips" variant="success">
          <ul>
            <li>
              On the <code>Live Messages</code> and <code>Live Map</code> pages
              press the <kbd>p</kbd> key on your keyboard to quickly
              pause/unpause the website updates so you can catch up on messages
              or freeze aircraft positions.
            </li>
            <li>
              On the bottom right corner of all pages you will get a little
              pop-over indicating a message came in that matched one of your
              alerts. Click on the box to pull up the message to see the
              contents of it.
            </li>
            <li>
              If a page has configuration options there will be a link in the
              top bar called <code>Page Settings</code> where you can adjust
              options for that page.
            </li>
          </ul>
        </Card>

        {/* Keyboard Shortcuts */}
        <Card title="Keyboard Shortcuts">
          <p>Use these keyboard shortcuts for quick navigation and control:</p>
          <ul>
            <li>
              <kbd>p</kbd> - Pause/unpause live updates (Live Messages and Live
              Map pages)
            </li>
            <li>
              <kbd>Esc</kbd> - Close modals and dialogs
            </li>
          </ul>
        </Card>

        {/* Alerts Section */}
        <Card title="Alerts">
          <p>
            To enable ACARS Hub to highlight messages that you may find
            interesting, please head on over to the <strong>ALERTS</strong> tab
            to set everything up.
          </p>
          <p>
            Separate each term in their respective text input box by a{" "}
            <code>,</code> (terms are case insensitive) and hit the update
            button to have ACARS Hub start monitoring for those terms. If you
            stay on the Alerts page you will see messages pop up that match your
            terms. On the Live Messages page you will see the message flagged
            with red text, and if you are on any other page the Alerts link on
            the top of the page will show a counter of messages that you've
            missed. If you want a list of curated terms that the community has
            determined generally indicate an interesting message click on the{" "}
            <code>Default Alert Values</code> link on the right side to autofill
            in those values.
          </p>
          <p>
            Additionally, you may see messages that are flagged as an alert but
            are of no interest to you. By inputting words and or phrases in the{" "}
            <code>Text field to ignore</code> setting on the <code>Alerts</code>{" "}
            Page you will be able to start filtering out messages that match a
            word or phrase you want alerted, but when that word or phrase is
            commonly found in combination with another word/phrase are
            meaningless to you. A typical example would be you want to see
            messages about <code>TURBULENCE</code> but want to ignore messages
            about <code>LIGHT TURBULENCE</code>.
          </p>
          <p>
            ACARS Hub can also play a sound if your search term(s) are matched.
            You can toggle the feature on / off by clicking{" "}
            <code>TURN [ON/OFF] ALERT SOUND</code> on the right side of the
            page. If you use Firefox or Chrome, this feature will work without
            additional configuration. However, Safari by default blocks all
            auto-play sounds so you will need to head to{" "}
            <code>Safari - Preferences - Websites - Auto Play</code> and find
            your ACARS Hub IP address or domain name in that list, and change
            the setting to <code>Allow All Auto-Play</code>, as illustrated in
            the image below:
          </p>
          <img
            src={safariImage}
            alt="Safari Auto-Play Configuration"
            style={{ maxWidth: "100%", height: "auto", marginTop: "1rem" }}
          />
        </Card>

        {/* Feedback / Help */}
        <Card title="Feedback / Help" variant="info">
          <p>
            Your feedback has been instrumental in improving this little project
            from a bare-bones website showing raw data to what it is now, and it
            is instrumental to guiding future improvements and making it a
            complete solution for feeding, receiving and viewing ACARS/VDLM
            data. Please, don't be a stranger on the{" "}
            <a
              href="https://discord.gg/sTf9uYF"
              target="_blank"
              rel="noopener noreferrer"
            >
              Discord
            </a>{" "}
            server and let us know what you think!
          </p>
          <p>
            Also the{" "}
            <a
              href="https://discord.gg/sTf9uYF"
              target="_blank"
              rel="noopener noreferrer"
            >
              Discord
            </a>{" "}
            server is a great place to get technical assistance in setting up
            the container or troubleshooting any issues that you might run in
            to. No question is too simple, everyone is welcome, and there are
            plenty of great folks around to help out.
          </p>
        </Card>

        {/* Version Information */}
        {version && (
          <Card title="Version Information">
            <p>
              <strong>Container Version:</strong> {version.container_version}
            </p>
            <p>
              <strong>GitHub Version:</strong> {version.github_version}
            </p>
            {version.is_outdated && (
              <p style={{ color: "var(--color-warning)", fontWeight: 600 }}>
                ⚠️ A newer version is available on GitHub
              </p>
            )}
          </Card>
        )}

        {/* License */}
        <Card title="License">
          <p>
            ACARS Hub is free software: you can redistribute it and/or modify it
            under the terms of the GNU General Public License as published by
            the Free Software Foundation, either version 3 of the License, or
            (at your option) any later version.
          </p>
          <p>
            ACARS Hub is distributed in the hope that it will be useful, but
            WITHOUT ANY WARRANTY; without even the implied warranty of
            MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
            General Public License for more details.
          </p>
          <p>
            <a
              href="https://github.com/sdr-enthusiasts/docker-acarshub"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </p>
        </Card>
      </div>
    </div>
  );
};
