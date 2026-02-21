import { Component, For } from "solid-js";

const reportPreview = [
  { title: "Kvällspass i sydvind", confidence: "68%", tip: "Långsamt hemtag nära grynnor." },
  { title: "Morgon vid brygglinjen", confidence: "74%", tip: "Fiska 6-8 cm jiggar på 2-3 meter." },
  { title: "Efter regn, stigande tryck", confidence: "61%", tip: "Byt till naturfärg och kortare kast." },
];

const ReportsPage: Component = () => {
  return (
    <main class="page pro-page">
      <header class="pro-page__header">
        <h1>Rapporter</h1>
        <p class="lead">
          AI-sammanfattningar från dina pass med mönster för vind, lufttryck och betesval.
        </p>
      </header>

      <section class="pro-list">
        <For each={reportPreview}>
          {(report) => (
            <article class="pro-card pro-card--report">
              <div class="pro-card__top">
                <h2>{report.title}</h2>
                <span class="pro-chip">Träffsäkerhet {report.confidence}</span>
              </div>
              <p>{report.tip}</p>
            </article>
          )}
        </For>
      </section>

      <section class="pro-note">
        <h3>Kommer i nästa steg</h3>
        <p>
          Automatiska veckorapporter med rekommenderad tid, djup, väderfönster och bete.
        </p>
      </section>
    </main>
  );
};

export default ReportsPage;
