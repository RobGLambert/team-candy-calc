/* Candy Calc — Team Builder edition
 * Fork of richi3f/candy-calc, adapted for Pokemon Legends: Z-A.
 *
 * Differences from upstream:
 *   - Plans a full party of up to 6 Pokemon at once instead of one.
 *   - Replaces the GLPK mixed-integer solve with an exact dynamic program,
 *     so jQuery, glpk.min.js and problem.txt are no longer needed.
 *   - Adds a Quasartico shop mode that restricts the solve to S / M / L,
 *     the only sizes sold for Mega Shards.
 */
( () => {
'use strict';

// ---------------------------------------------------------------- constants

const CANDIES = [
    { key: 'xs', label: 'XS', title: 'Extra Small', exp: 100,   shards: null },
    { key: 's',  label: 'S',  title: 'Small',       exp: 800,   shards: 8    },
    { key: 'm',  label: 'M',  title: 'Medium',      exp: 3000,  shards: 30   },
    { key: 'l',  label: 'L',  title: 'Large',       exp: 10000, shards: 100  },
    { key: 'xl', label: 'XL', title: 'Extra Large', exp: 30000, shards: null }
];

// Every candy yield is a multiple of 100, so the dynamic program counts in
// units of 100 Exp. instead of raw Exp. That shrinks the table 100-fold.
const UNIT = 100;
const SHOP_KEYS = [ 's', 'm', 'l' ];   // sold at Quasartico Inc. for Mega Shards
const MAX_SLOTS = 6;
const MAX_LEVEL = 100;
const INF = Infinity;

// Exp. curves, unchanged from upstream.
const CURVES = {
    'Fast': n => Math.floor( Math.pow( n, 3 ) * 4 / 5 ),
    'Medium Fast': n => Math.pow( n, 3 ),
    'Medium Slow': n => Math.floor(
        Math.pow( n, 3 ) * 6 / 5 - Math.pow( n, 2 ) * 15 + n * 100 - 140 ),
    'Slow': n => Math.floor( Math.pow( n, 3 ) * 5 / 4 ),
    'Erratic': n => {
        if ( n < 50 ) return Math.floor( Math.pow( n, 3 ) * ( 100 - n ) / 50 );
        if ( n <= 68 ) return Math.floor( Math.pow( n, 3 ) * ( 150 - n ) / 100 );
        if ( n < 98 ) return Math.floor( Math.pow( n, 3 ) * ( 1911 - n * 10 ) / 1500 );
        return Math.floor( Math.pow( n, 3 ) * ( 160 - n ) / 100 );
    },
    'Fluctuating': n => {
        if ( n < 15 ) return Math.floor( Math.pow( n, 3 ) * ( 73 + n ) / 150 );
        if ( n < 36 ) return Math.floor( Math.pow( n, 3 ) * ( 14 + n ) / 50 );
        return Math.floor( Math.pow( n, 3 ) * ( 64 + n ) / 100 );
    }
};

const expAtLevel = ( curve, n ) => ( n <= 1 ) ? 0 : CURVES[ curve ]( n );
const fmt = n => n.toLocaleString( 'en-US' );
const clamp = ( n, lo, hi ) => Math.max( lo, Math.min( n, hi ) );

// ------------------------------------------------------------------- solver

/**
 * Cheapest bag of candy that covers `expNeeded`.
 *
 * Upstream minimised sum( (yield_i + 1) * count_i ), which is really a
 * lexicographic objective: waste as little Exp. as possible, then use as few
 * candies as possible. This reproduces that exactly with an unbounded
 * knapsack over 100-Exp. units.
 *
 * @param {number} expNeeded   Exp. points still required (>= 0).
 * @param {string[]} allowed   Candy keys the solve may use.
 * @returns {{counts:Object, expGiven:number, surplus:number, total:number}|null}
 *          null when `allowed` is empty or nothing can reach the target.
 */
function solve( expNeeded, allowed ) {
    const sizes = CANDIES.filter( c => allowed.includes( c.key ) );
    if ( !sizes.length ) return null;

    const empty = { counts: {}, expGiven: 0, surplus: 0, total: 0 };
    sizes.forEach( c => empty.counts[ c.key ] = 0 );
    if ( expNeeded <= 0 ) return empty;

    const yields = sizes.map( c => c.exp / UNIT );
    const target = Math.ceil( expNeeded / UNIT );
    const maxY = Math.max( ...yields );

    // Overshooting by a full candy is never optimal, so the table only has to
    // run one candy past the target.
    const cap = target + maxY;
    const count = new Float64Array( cap + 1 ).fill( INF );
    count[ 0 ] = 0;

    for ( let u = 1; u <= cap; u++ ) {
        let best = INF;
        for ( let i = 0; i < yields.length; i++ ) {
            const prev = u - yields[ i ];
            if ( prev >= 0 && count[ prev ] + 1 < best ) best = count[ prev ] + 1;
        }
        count[ u ] = best;
    }

    // Least Exp. wasted first, then fewest candies. Not every unit total is
    // reachable once XS is off the table, hence the scan.
    let pick = -1;
    for ( let u = target; u <= cap; u++ ) {
        if ( count[ u ] !== INF ) { pick = u; break; }
    }
    if ( pick < 0 ) return null;

    // Walk the table back to recover which candies were used.
    const counts = {};
    sizes.forEach( c => counts[ c.key ] = 0 );
    let u = pick;
    while ( u > 0 ) {
        for ( let i = sizes.length - 1; i >= 0; i-- ) {
            const prev = u - yields[ i ];
            if ( prev >= 0 && count[ prev ] === count[ u ] - 1 ) {
                counts[ sizes[ i ].key ]++;
                u = prev;
                break;
            }
        }
    }

    const expGiven = pick * UNIT;
    return {
        counts,
        expGiven,
        surplus: expGiven - expNeeded,
        total: count[ pick ]
    };
}

/**
 * Price a candy tally at Quasartico Inc.
 * @returns {{shards:number, dropOnly:number}} shard cost of the sizes that are
 *          sold, and how many candies have to come from drops instead.
 */
function shardCost( counts ) {
    let shards = 0, dropOnly = 0;
    for ( const candy of CANDIES ) {
        const n = counts[ candy.key ] || 0;
        if ( !n ) continue;
        if ( candy.shards === null ) dropOnly += n;
        else shards += n * candy.shards;
    }
    return { shards, dropOnly };
}

// ---------------------------------------------------------------------- app

let POKEMON = {};            // display name -> Exp. curve name
const slots = [];            // one entry per party slot

const $  = sel => document.querySelector( sel );
const el = ( tag, cls, text ) => {
    const node = document.createElement( tag );
    if ( cls ) node.className = cls;
    if ( text !== undefined ) node.textContent = text;
    return node;
};

function allowedKeys() {
    return $( '#shop-only' ).checked
        ? SHOP_KEYS.slice()
        : CANDIES.map( c => c.key );
}

function buildSlot( index ) {
    const card = el( 'article', 'slot' );
    card.innerHTML = `
        <header>
            <span class="slot-no">${ index + 1 }</span>
            <input class="species" type="text" list="pokemon-list"
                   placeholder="Empty slot" aria-label="Pokemon in slot ${ index + 1 }"
                   autocomplete="off" spellcheck="false">
            <button type="button" class="clear" title="Clear this slot"
                    aria-label="Clear slot ${ index + 1 }">&times;</button>
        </header>
        <div class="levels">
            <label>From
                <input class="from" type="number" inputmode="numeric"
                       min="1" max="${ MAX_LEVEL - 1 }" value="1">
            </label>
            <label>To
                <input class="to" type="number" inputmode="numeric"
                       min="2" max="${ MAX_LEVEL }" value="100">
            </label>
            <span class="curve" aria-live="polite"></span>
        </div>
    `;

    const slot = {
        card,
        species: card.querySelector( '.species' ),
        from:    card.querySelector( '.from' ),
        to:      card.querySelector( '.to' ),
        curve:   card.querySelector( '.curve' )
    };

    slot.species.addEventListener( 'input', () => { refreshCurve( slot ); recalc(); } );
    slot.from.addEventListener( 'input', recalc );
    slot.to.addEventListener( 'input', recalc );
    [ slot.from, slot.to ].forEach( input => {
        input.addEventListener( 'blur', () => {
            const n = parseInt( input.value, 10 );
            input.value = isNaN( n )
                ? input.min
                : clamp( n, +input.min, +input.max );
            recalc();
        } );
    } );
    card.querySelector( '.clear' ).addEventListener( 'click', () => {
        slot.species.value = '';
        slot.from.value = 1;
        slot.to.value = MAX_LEVEL;
        refreshCurve( slot );
        recalc();
        slot.species.focus();
    } );

    slots.push( slot );
    return card;
}

/** Case-insensitive species lookup against the loaded dex. */
function matchSpecies( value ) {
    const key = value.trim().toLowerCase();
    if ( !key ) return null;
    for ( const name in POKEMON ) {
        if ( name.toLowerCase() === key ) return name;
    }
    return null;
}

function refreshCurve( slot ) {
    const name = matchSpecies( slot.species.value );
    slot.curve.textContent = name ? POKEMON[ name ] : '';
    slot.card.classList.toggle( 'filled', !!name );
    slot.card.classList.toggle(
        'unknown', slot.species.value.trim().length > 0 && !name );
}

/** Read every slot and return the ones that describe a real, valid job. */
function readTeam() {
    const team = [];
    slots.forEach( ( slot, i ) => {
        const name = matchSpecies( slot.species.value );
        if ( !name ) return;
        const from = clamp( parseInt( slot.from.value, 10 ) || 1, 1, MAX_LEVEL );
        const to   = clamp( parseInt( slot.to.value, 10 ) || 1, 1, MAX_LEVEL );
        const curve = POKEMON[ name ];
        team.push( {
            slot: i + 1,
            name,
            curve,
            from,
            to,
            invalid: to <= from,
            expNeeded: Math.max( 0, expAtLevel( curve, to ) - expAtLevel( curve, from ) )
        } );
    } );
    return team;
}

// ------------------------------------------------------------------ results

function recalc() {
    const team = readTeam();
    const allowed = allowedKeys();
    const sizes = CANDIES.filter( c => allowed.includes( c.key ) );
    const out = $( '#results' );
    out.innerHTML = '';

    if ( !team.length ) {
        out.appendChild( el( 'p', 'empty',
            'Add a Pokemon to a slot above and the plan appears here.' ) );
        return;
    }

    const bad = team.filter( m => m.invalid );
    if ( bad.length ) {
        out.appendChild( el( 'p', 'warn', bad.length === 1
            ? `Slot ${ bad[ 0 ].slot }: the target level has to be above the current level.`
            : `Slots ${ bad.map( m => m.slot ).join( ', ' ) }: target levels have to be above current levels.` ) );
    }

    const jobs = team.filter( m => !m.invalid );
    if ( !jobs.length ) return;

    const rows = jobs.map( m => ( { member: m, plan: solve( m.expNeeded, allowed ) } ) );

    // Totals across the party.
    const totals = {};
    sizes.forEach( c => totals[ c.key ] = 0 );
    let totalExp = 0, totalSurplus = 0, totalCandy = 0;
    rows.forEach( ( { member, plan } ) => {
        if ( !plan ) return;
        sizes.forEach( c => totals[ c.key ] += plan.counts[ c.key ] || 0 );
        totalExp += member.expNeeded;
        totalSurplus += plan.surplus;
        totalCandy += plan.total;
    } );

    // --- table
    const table = el( 'table', 'plan' );
    const head = el( 'thead' );
    const hr = el( 'tr' );
    hr.appendChild( el( 'th', 'th-mon', 'Pokemon' ) );
    hr.appendChild( el( 'th', 'th-lv', 'Levels' ) );
    hr.appendChild( el( 'th', 'num', 'Exp. needed' ) );
    sizes.forEach( c => {
        const th = el( 'th', 'num' );
        const abbr = el( 'abbr', null, c.label );
        abbr.title = c.title + ' Exp. Candy';
        th.appendChild( abbr );
        hr.appendChild( th );
    } );
    hr.appendChild( el( 'th', 'num', 'Wasted' ) );
    head.appendChild( hr );
    table.appendChild( head );

    const body = el( 'tbody' );
    rows.forEach( ( { member, plan } ) => {
        const tr = el( 'tr' );
        const mon = el( 'td', 'th-mon' );
        mon.appendChild( el( 'span', 'slot-no', String( member.slot ) ) );
        mon.appendChild( el( 'span', 'mon-name', member.name ) );
        mon.appendChild( el( 'span', 'mon-curve', member.curve ) );
        tr.appendChild( mon );
        tr.appendChild( el( 'td', 'th-lv', `${ member.from } \u2192 ${ member.to }` ) );

        if ( !plan ) {
            const td = el( 'td', 'num warn-cell' );
            td.colSpan = sizes.length + 2;
            td.textContent = 'No combination reaches this target.';
            tr.appendChild( td );
            body.appendChild( tr );
            return;
        }

        tr.appendChild( el( 'td', 'num', fmt( member.expNeeded ) ) );
        sizes.forEach( c => {
            const n = plan.counts[ c.key ] || 0;
            tr.appendChild( el( 'td', n ? 'num' : 'num zero', n ? fmt( n ) : '\u2013' ) );
        } );
        tr.appendChild( el( 'td', plan.surplus ? 'num' : 'num zero',
            plan.surplus ? fmt( plan.surplus ) : '0' ) );
        body.appendChild( tr );
    } );
    table.appendChild( body );

    const foot = el( 'tfoot' );
    const fr = el( 'tr' );
    const label = el( 'td', 'th-mon', 'Party total' );
    label.colSpan = 2;
    fr.appendChild( label );
    fr.appendChild( el( 'td', 'num', fmt( totalExp ) ) );
    sizes.forEach( c => fr.appendChild(
        el( 'td', totals[ c.key ] ? 'num' : 'num zero',
            totals[ c.key ] ? fmt( totals[ c.key ] ) : '\u2013' ) ) );
    fr.appendChild( el( 'td', totalSurplus ? 'num' : 'num zero',
        totalSurplus ? fmt( totalSurplus ) : '0' ) );
    foot.appendChild( fr );
    table.appendChild( foot );
    out.appendChild( table );

    // --- summary line
    const { shards, dropOnly } = shardCost( totals );
    const mons = jobs.length === 1 ? '1 Pokemon' : `${ jobs.length } Pokemon`;
    const summary = el( 'p', 'summary' );
    const line = txt => summary.appendChild( document.createTextNode( txt ) );

    summary.appendChild( el( 'strong', null, `${ fmt( totalCandy ) } candies` ) );
    line( ` for ${ mons }, wasting ${ fmt( totalSurplus ) } Exp.` );

    if ( shards ) {
        line( dropOnly ? ' The S, M and L cost ' : ' That is ' );
        summary.appendChild( el( 'strong', 'shards', `${ fmt( shards ) } Mega Shards` ) );
        line( ' at Quasartico Inc.' );
    }
    if ( dropOnly ) {
        line( ` ${ fmt( dropOnly ) } of them are XS or XL, which are not sold for shards \u2014 those have to come from Alphas, missions or loot around Lumiose.` );
    }
    out.appendChild( summary );
}

// -------------------------------------------------------------------- start

function populateDex( data ) {
    for ( const name in data ) POKEMON[ name ] = data[ name ];
    const list = $( '#pokemon-list' );
    const frag = document.createDocumentFragment();
    Object.keys( POKEMON ).forEach( name => {
        const option = document.createElement( 'option' );
        option.value = name;
        frag.appendChild( option );
    } );
    list.innerHTML = '';
    list.appendChild( frag );
    slots.forEach( refreshCurve );
    recalc();
}

function init() {
    const roster = $( '#roster' );
    for ( let i = 0; i < MAX_SLOTS; i++ ) roster.appendChild( buildSlot( i ) );

    $( '#shop-only' ).addEventListener( 'change', recalc );
    $( '#reset' ).addEventListener( 'click', () => {
        slots.forEach( slot => {
            slot.species.value = '';
            slot.from.value = 1;
            slot.to.value = MAX_LEVEL;
            refreshCurve( slot );
        } );
        recalc();
    } );

    recalc();
}

// Exposed for tests.
if ( typeof module !== 'undefined' ) {
    module.exports = { solve, shardCost, expAtLevel, CANDIES, CURVES };
}

if ( typeof window === 'undefined' ) return;

const domReady = () => new Promise( res => {
    if ( document.readyState !== 'loading' ) res();
    else document.addEventListener( 'DOMContentLoaded', res );
} );

/** Say out loud whether the species list arrived. A silent empty dex just
 *  looks like a broken autocomplete box, which is very hard to diagnose. */
function reportDex( error ) {
    const node = $( '#dex-status' );
    if ( !node ) return;
    const n = Object.keys( POKEMON ).length;
    if ( n && !error ) {
        node.className = 'dex-status ok';
        node.textContent = `${ fmt( n ) } species loaded. Start typing a name in any slot.`;
        return;
    }
    node.className = 'dex-status bad';
    node.textContent = 'Could not load the species list, so the name suggestions are '
        + 'empty. Check that static/pokemon-data.js was deployed alongside index.html'
        + ( error ? ` (${ error })` : '' ) + '.';
}

if ( typeof window === 'undefined' ) return;

/** Load the species list. Preferred path is the plain script tag, which has
 *  nothing to fetch; the JSON fetch stays as a fallback. */
function loadDex() {
    if ( window.POKEMON_DATA ) return Promise.resolve( window.POKEMON_DATA );
    if ( typeof fetch !== 'function' ) {
        return Promise.reject( new Error( 'static/pokemon-data.js did not load' ) );
    }
    return fetch( 'static/pokemon.json' )
        .then( r => {
            if ( !r.ok ) throw new Error( 'HTTP ' + r.status );
            return r.json();
        } )
        .then( raw => {
            const map = {};
            for ( const slug in raw ) map[ raw[ slug ].name ] = raw[ slug ].experience_group;
            return map;
        } );
}

domReady().then( () => {
    // Build the interface first so a dex problem can never leave a blank page.
    init();
    return loadDex().then( data => {
        populateDex( data );
        reportDex();
    } );
} ).catch( err => reportDex( err.message ) );

} )();
