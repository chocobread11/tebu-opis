<script setup lang="ts">
defineProps<{ jug?: boolean; hero?: boolean }>()
</script>
<template>
  <svg v-if="!jug" viewBox="0 0 130 240" role="img" aria-label="500 ml Tebu Drop sugarcane flask" :class="['bottle-art', { 'hero-bottle': hero }]">
    <defs><linearGradient id="juice" x1="0" x2="1"><stop stop-color="#9bad3d"/><stop offset=".25" stop-color="#d6df72"/><stop offset=".75" stop-color="#becd55"/><stop offset="1" stop-color="#93a12e"/></linearGradient><linearGradient id="glass" x1="0" x2="1"><stop stop-color="#e9efcb" stop-opacity=".8"/><stop offset=".2" stop-color="#fff" stop-opacity=".8"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#f6f8df" stop-opacity=".4"/></linearGradient></defs>
    <ellipse cx="65" cy="229" rx="43" ry="6" fill="#29472b" opacity=".13"/>
    <path d="M43 30h44v17c0 10 17 18 17 33v132q0 12-14 13H40q-14-1-14-13V80c0-15 17-23 17-33Z" fill="url(#glass)" stroke="#87994b" stroke-opacity=".5"/>
    <path d="M30 88h70v121q0 11-12 11H42q-12 0-12-11Z" fill="url(#juice)"/>
    <path d="M37 88v115" stroke="white" stroke-width="4" opacity=".28" stroke-linecap="round"/>
    <rect x="40" y="16" width="50" height="26" rx="7" fill="#edf0de" stroke="#c7ceae"/><path d="M45 22h40M45 28h40M45 34h40" stroke="#c7ceae"/>
    <rect x="27" y="111" width="76" height="76" rx="2" fill="#f8f5e7"/><path d="M28 111h74v10H28z" fill="#23462f"/>
    <text x="65" y="143" text-anchor="middle" font-size="17" font-family="Arial" font-weight="900" fill="#23462f">tebu</text><text x="65" y="159" text-anchor="middle" font-size="17" font-family="Arial" font-weight="900" fill="#23462f">drop.</text><text x="65" y="175" text-anchor="middle" font-size="5" letter-spacing="1.2" font-family="Arial" fill="#23462f">PURE SUGARCANE</text>
    <circle cx="92" cy="99" r="2" fill="#fff" opacity=".7"/><circle cx="35" cy="195" r="2.4" fill="#fff" opacity=".5"/>
  </svg>
  <svg v-else viewBox="0 0 150 210" role="img" aria-label="1 litre Tebu Drop sharing jug" class="bottle-art jug-art"><defs><linearGradient id="jugjuice"><stop stop-color="#9bad3d"/><stop offset=".4" stop-color="#d4dd71"/><stop offset="1" stop-color="#a3b746"/></linearGradient></defs><ellipse cx="75" cy="200" rx="54" ry="6" fill="#29472b" opacity=".12"/><path d="M46 34h45v13l31 22v115q0 12-12 12H35q-12 0-12-12V69l23-22Z" fill="#e0e5ba" stroke="#a2af6f"/><path d="M27 82h91v100q0 10-10 10H37q-10 0-10-10Z" fill="url(#jugjuice)"/><path d="M98 46q35-5 34 41v18h-11V83q0-23-23-24Z" fill="#d4dcb6" stroke="#9fae77"/><rect x="41" y="19" width="55" height="21" rx="5" fill="#264b32"/><path d="M48 23v13m8-13v13m8-13v13m8-13v13m8-13v13m8-13v13" stroke="#4c6a47"/><rect x="24" y="106" width="97" height="57" fill="#f8f5e7"/><text x="72" y="132" text-anchor="middle" font-family="Arial" font-size="19" font-weight="900" fill="#23462f">tebudrop.</text><text x="72" y="148" text-anchor="middle" font-family="Arial" font-size="6" letter-spacing="1.5" fill="#23462f">THE SHARING JUG · 1L</text><path d="M34 87v93" stroke="white" stroke-width="4" opacity=".25" stroke-linecap="round"/></svg>
</template>
