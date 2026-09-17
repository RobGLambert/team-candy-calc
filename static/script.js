/**
 * Pokémon Candy & Team Calculator
 */

// Configuration & Constants
const CANDIES = [
  { id: 'XL', exp: 30000, name: 'Exp. Candy XL' },
  { id: 'L',  exp: 10000, name: 'Exp. Candy L' },
  { id: 'M',  exp: 3000,  name: 'Exp. Candy M' },
  { id: 'S',  exp: 800,   name: 'Exp. Candy S' },
  { id: 'XS', exp: 100,   name: 'Exp. Candy XS' }
];

// Stub for Legends ZA Mega Shards (Adjust prices as needed)
const SHARD_PRICES = {
  S: 10,
  M: 35,
  L: 100
};

// Global Application State
const state = {
  pokemonData: null,
  allowedCandies: new Set(['S', 'M', 'L']), // Default enabled sizes
  team: [
    { id: Date.now(), pokemonKey: '', currentLevel: 1, targetLevel: 50 }
  ]
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  await loadPokemonData();
  initUI();
  calculateAndRender();
});

async function loadPokemonData() {
  try {
    const response = await fetch('pokemon.json');
    state.pokemonData = await response.json();
  } catch (error) {
    console.error('Failed to load pokemon.json:', error);
  }
}

function initUI() {
  // Bind Candy Filter Checkboxes
  document.querySelectorAll('.candy-toggle').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const size = e.target.value;
      if (e.target.checked) {
        state.allowedCandies.add(size);
      } else {
        state.allowedCandies.delete(size);
      }
      calculateAndRender();
    });
  });

  // Add Member Button Listener
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

// --- Dynamic UI Rendering ---
function renderTeamSlots() {
  const container = document.getElementById('team-container');
  if (!container) return;

  container.innerHTML = '';

  state.team.forEach((member, index) => {
    const card = document.createElement('div');
    card.className = 'team-member-card';
    card.dataset.id = member.id;

    card.innerHTML = `
      <div class="card-header">
        <h4>Member ${index + 1}</h4>
        ${state.team.length > 1 ? `<button class="remove-btn" onclick="removeMember(${member.id})">✕</button>` : ''}
      </div>
      <div class="card-body">
        <label>
          Pokémon:
          <select class="species-select" onchange="updateMember(${member.id}, 'pokemonKey', this.value)">
            <option value="">Select Pokémon...</option>
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

  // Disable add button if team size limit reached
  const addBtn = document.getElementById('add-member-btn');
  if (addBtn) addBtn.disabled = state.team.length >= 6;
}

function getPokemonOptions(selectedKey) {
  if (!state.pokemonData) return '';
  
  // Sort species alphabetically
  const keys = Object.keys(state.pokemonData).sort();
  return keys.map(key => {
    const selected = key === selectedKey ? 'selected' : '';
    const name = state.pokemonData[key].name || key;
    return `<option value="${key}" ${selected}>${name}</option>`;
  }).join('');
}

// --- State Mutations ---
window.updateMember = function(id, field, value) {
  const member = state.team.find(m => m.id === id);
  if (member) {
    member[field] = value;
    
    // Bounds enforcement
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

// --- Calculation Engine ---
function calculateAndRender() {
  const activeCandies = CANDIES.filter(c => state.allowedCandies.has(c.id));
  const teamTotals = { XS: 0, S: 0, M: 0, L: 0, XL: 0, totalXP: 0 };

  state.team.forEach(member => {
    const memberOutputEl = document.getElementById(`output-${member.id}`);
    
    if (!member.pokemonKey || !state.pokemonData[member.pokemonKey]) {
      if (memberOutputEl) memberOutputEl.innerHTML = '<small>Select a Pokémon</small>';
      return;
    }

    const requiredXP = calculateXP(
      state.pokemonData[member.pokemonKey],
      member.currentLevel,
      member.targetLevel
    );

    const candyAlloc = allocateCandies(requiredXP, activeCandies);

    // Accumulate Team Totals
    teamTotals.totalXP += requiredXP;
    Object.keys(candyAlloc).forEach(size => {
      teamTotals[size] += candyAlloc[size];
    });

    // Render individual member breakdown
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
  
  // Handles growth rates or direct cumulative EXP arrays in pokemon.json
  const expTable = pokemon.expTable || (state.pokemonData.growthRates && state.pokemonData.growthRates[pokemon.growthRate]);
  
  if (expTable) {
    return expTable[targetLvl - 1] - expTable[currentLvl - 1];
  }
  
  return 0; // Fallback if schema differs
}

function allocateCandies(requiredXP, activeCandies) {
  const allocation = { XS: 0, S: 0, M: 0, L: 0, XL: 0 };
  if (requiredXP <= 0 || activeCandies.length === 0) return allocation;

  let remainingXP = requiredXP;

  // Greedy allocation from largest active size to smallest
  for (const candy of activeCandies) {
    if (remainingXP <= 0) break;
    const count = Math.floor(remainingXP / candy.exp);
    if (count > 0) {
      allocation[candy.id] = count;
      remainingXP -= count * candy.exp;
    }
  }

  // Cover remaining XP gap with 1 smallest allowed candy
  if (remainingXP > 0) {
    const smallestAllowed = activeCandies[activeCandies.length - 1];
    allocation[smallestAllowed.id] += 1;
  }

  return allocation;
}

function calculateMegaShards(teamTotals) {
  return (teamTotals.S * (SHARD_PRICES.S || 0)) +
         (teamTotals.M * (SHARD_PRICES.M || 0)) +
         (teamTotals.L * (SHARD_PRICES.L || 0));
}

// --- Summary & Output Formatting ---
function renderTeamSummary(teamTotals) {
  const summaryEl = document.getElementById('total-candies-output');
  if (!summaryEl) return;

  const shardsNeeded = calculateMegaShards(teamTotals);

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