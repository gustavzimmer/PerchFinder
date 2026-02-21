import { A } from "@solidjs/router";
import { Component, For } from "solid-js";

const leaguePreview = [
  { name: "Malmö Hamn-ligan", members: 24, cadence: "Veckopoäng" },
  { name: "Sydkust Perch Cup", members: 18, cadence: "Månadsrank" },
  { name: "Team PB Söndag", members: 9, cadence: "Privat liga" },
];

const LeaguesPage: Component = () => {
  return (
    <main class="page pro-page">
      <header class="pro-page__header">
        <h1>Ligor</h1>
        <p class="lead">
          Jämför dig med kompisar, följ veckopoäng och lås upp säsongsutmaningar.
        </p>
      </header>

      <section class="pro-grid">
        <For each={leaguePreview}>
          {(league) => (
            <article class="pro-card">
              <h2>{league.name}</h2>
              <p>{league.members} medlemmar</p>
              <span class="pro-chip">{league.cadence}</span>
            </article>
          )}
        </For>
      </section>

      <section class="pro-note">
        <h3>Kommer i nästa steg</h3>
        <p>
          Skapa egna ligor, bjud in vänner och se live leaderboard för 7-dagarsperioder.
        </p>
        <A href="/perchbuddy" class="link-button">Till PerchBuddy</A>
      </section>
    </main>
  );
};

export default LeaguesPage;
