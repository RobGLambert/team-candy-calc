/**
 * Pokémon Candy & Team Calculator
 */

const CANDIES = [
  { id: 'XL', exp: 30000, name: 'Exp. Candy XL' },
  { id: 'L',  exp: 10000, name: 'Exp. Candy L' },
  { id: 'M',  exp: 3000,  name: 'Exp. Candy M' },
  { id: 'S',  exp: 800,   name: 'Exp. Candy S' },
  { id: 'XS', exp: 100,   name: 'Exp. Candy XS' }
];

const SHARD_PRICES = { S: 10, M: 35, L: 100 };

const state = {
  pokemonData: null,
  allowedCandies: new Set(['S', 'M', 'L']),
  team: [
    { id: Date.now(), pokemonKey: '', currentLevel: 1, targetLevel: 50 }
  ]
};

// Initialize immediately so UI renders even if fetch fails
document.addEventListener('DOMContentLoaded', () => {
  initUI();
  renderTeamSlots();
  calculateAndRender();
  loadPokemonData();
});

async function loadPokemonData() {
  try {
    // Point fetch to the static/ directory
    const response = await fetch('./static/pokemon.json');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - File not found at ${response.url}`);
    }

    state.pokemonData = await response.json();
    renderTeamSlots();
    calculateAndRender();
  } catch (error) {
    console.error('Failed to load pokemon.json:', error.message);
  }
}

function initUI() {
  document.querySelectorAll('.candy-toggle').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.allowedCandies.add(e.target.value);
      } else {
        state.allowedCandies.delete(e.target.value);
      }
      calculateAndRender();
    });
  });

  const addBtn = document.getElementById('add-member-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (state.team.length < 6) {
        state.team.push({
          id: Date.now(),
          pokemonKey: '',
          currentLevel: 1,
          targetLevel: 50
        });
        renderTeamSlots();
        calculateAndRender();
      }
    });
  }
}

function renderTeamSlots() {
  const container = document.getElementById('team-container');
  if (!container) return;

  container.innerHTML = '';

  state.team.forEach((member, index) => {
    const card = document.createElement('div');
    card.className = 'team-member-card';

    card.innerHTML = `
      <div class="card-header">
        <h4>Member ${index + 1}</h4>
        ${state.team.length > 1 ? `<button class="remove-btn" onclick="removeMember(${member.id})">✕</button>` : ''}
      </div>
      <div class="card-body">
        <label>
          Pokémon:
          <select class="species-select" onchange="updateMember(${member.id}, 'pokemonKey', this.value)">
            <option value="">${state.pokemonData ? 'Select Pokémon...' : 'Loading Data / Server Required...'}</option>
            ${getPokemonOptions(member.pokemonKey)}
          </select>
        </label>

        <div class="level-inputs">
          <label>
            Current Lvl:
            <input type="number" min="1" max="99" value="${member.currentLevel}"
                   onchange="updateMember(${member.id}, 'currentLevel', parseInt(this.value) || 1)">
          </label>
          <label>
            Target Lvl:
            <input type="number" min="2" max="100" value="${member.targetLevel}"
                   onchange="updateMember(${member.id}, 'targetLevel', parseInt(this.value) || 100)">
          </label>
        </div>

        <div class="member-candy-output" id="output-${member.id}"></div>
      </div>
    `;

    container.appendChild(card);
  });

  const addBtn = document.getElementById('add-member-btn');
  if (addBtn) addBtn.disabled = state.team.length >= 6;
}

function getPokemonOptions(selectedKey) {
  if (!state.pokemonData) return '';
  return Object.keys(state.pokemonData).sort().map(key => {
    const selected = key === selectedKey ? 'selected' : '';
    const name = state.pokemonData[key].name || key;
    return `<option value="${key}" ${selected}>${name}</option>`;
  }).join('');
}

window.updateMember = function(id, field, value) {
  const member = state.team.find(m => m.id === id);
  if (member) {
    member[field] = value;
    if (field === 'currentLevel') member.currentLevel = Math.max(1, Math.min(99, member.currentLevel));
    if (field === 'targetLevel') member.targetLevel = Math.max(member.currentLevel + 1, Math.min(100, member.targetLevel));
    calculateAndRender();
  }
};

window.removeMember = function(id) {
  state.team = state.team.filter(m => m.id !== id);
  renderTeamSlots();
  calculateAndRender();
};

function calculateAndRender() {
  const activeCandies = CANDIES.filter(c => state.allowedCandies.has(c.id));
  const teamTotals = { XS: 0, S: 0, M: 0, L: 0, XL: 0, totalXP: 0 };

  state.team.forEach(member => {
    const memberOutputEl = document.getElementById(`output-${member.id}`);

    if (!member.pokemonKey || !state.pokemonData || !state.pokemonData[member.pokemonKey]) {
      if (memberOutputEl) memberOutputEl.innerHTML = '<small>Select a Pokémon</small>';
      return;
    }

    const requiredXP = calculateXP(
      state.pokemonData[member.pokemonKey],
      member.currentLevel,
      member.targetLevel
    );

    const candyAlloc = allocateCandies(requiredXP, activeCandies);

    teamTotals.totalXP += requiredXP;
    Object.keys(candyAlloc).forEach(size => {
      teamTotals[size] += candyAlloc[size];
    });

    if (memberOutputEl) {
      memberOutputEl.innerHTML = `
        <p><strong>XP Needed:</strong> ${requiredXP.toLocaleString()}</p>
        <p><strong>Candies:</strong> ${formatCandyBreakdown(candyAlloc)}</p>
      `;
    }
  });

  renderTeamSummary(teamTotals);
}

function calculateXP(pokemon, currentLvl, targetLvl) {
  if (currentLvl >= targetLvl) return 0;
  const expTable = pokemon.expTable || (state.pokemonData.growthRates && state.pokemonData.growthRates[pokemon.growthRate]);
  if (expTable) {
    return expTable[targetLvl - 1] - expTable[currentLvl - 1];
  }
  return 0;
}

function allocateCandies(requiredXP, activeCandies) {
  const allocation = { XS: 0, S: 0, M: 0, L: 0, XL: 0 };
  if (requiredXP <= 0 || activeCandies.length === 0) return allocation;

  let remainingXP = requiredXP;

  for (const candy of activeCandies) {
    if (remainingXP <= 0) break;
    const count = Math.floor(remainingXP / candy.exp);
    if (count > 0) {
      allocation[candy.id] = count;
      remainingXP -= count * candy.exp;
    }
  }

  if (remainingXP > 0) {
    const smallestAllowed = activeCandies[activeCandies.length - 1];
    allocation[smallestAllowed.id] += 1;
  }

  return allocation;
}

function renderTeamSummary(teamTotals) {
  const summaryEl = document.getElementById('total-candies-output');
  if (!summaryEl) return;

  const shardsNeeded = (teamTotals.S * SHARD_PRICES.S) + (teamTotals.M * SHARD_PRICES.M) + (teamTotals.L * SHARD_PRICES.L);

  summaryEl.innerHTML = `
    <div class="summary-card">
      <h3>Team Totals</h3>
      <p><strong>Total XP Required:</strong> ${teamTotals.totalXP.toLocaleString()}</p>
      <div class="total-candies-list">
        ${formatCandyBreakdown(teamTotals)}
      </div>
      <div class="shards-estimate">
        <p><strong>Est. Mega Shards (S/M/L):</strong> 💎 ${shardsNeeded.toLocaleString()}</p>
      </div>
    </div>
  `;
}

function formatCandyBreakdown(candyCounts) {
  const parts = [];
  CANDIES.forEach(c => {
    if (candyCounts[c.id] > 0) {
      parts.push(`<span><strong>${candyCounts[c.id]}x</strong> ${c.id}</span>`);
    }
  });
  return parts.length > 0 ? parts.join(', ') : 'None';
}
