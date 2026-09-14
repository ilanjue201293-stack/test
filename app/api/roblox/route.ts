import { NextRequest, NextResponse } from 'next/server'

const GAMES='https://games.roblox.com'
const THUMBS='https://thumbnails.roblox.com'
const SEARCH='https://apis.roblox.com/search-api'

async function json(url:string){const r=await fetch(url,{cache:'no-store',headers:{'User-Agent':'RBX-Analytics/1.0'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}

function extractId(q:string){
  const m=q.match(/(?:games|experiences)\/(\d+)/i)||q.match(/^\s*(\d+)\s*$/)
  return m?.[1]||null
}

export async function GET(req:NextRequest){
  const p=req.nextUrl.searchParams; const action=p.get('action')||'search'; const q=p.get('q')||''
  try{
    if(action==='search'){
      const id=extractId(q)
      if(id) return NextResponse.json({results:await loadGames([id])})
      if(!q.trim()) return NextResponse.json({results:[]})
      let data:any
      try{data=await json(`${SEARCH}/omni-search?searchQuery=${encodeURIComponent(q)}&pageType=all&limit=20`)}catch{data=null}
      const items=(data?.searchResults||data?.contents||data?.results||[]).flatMap((x:any)=>x?.contents||x?.items||[x])
      const ids=items.map((x:any)=>x?.universeId||x?.universeID||x?.id).filter((x:any)=>/^\d+$/.test(String(x))).slice(0,20)
      if(ids.length) return NextResponse.json({results:await loadGames(ids)})
      return NextResponse.json({results:[]})
    }
    if(action==='game'){
      const id=extractId(q)||q
      if(!/^\d+$/.test(id)) return NextResponse.json({error:'Universe ID invalide'},{status:400})
      return NextResponse.json(await loadGame(id))
    }
    return NextResponse.json({error:'Action inconnue'},{status:400})
  }catch(e:any){return NextResponse.json({error:e?.message||'Roblox API error'},{status:502})}
}

async function loadGames(ids:string[]){
 const chunks=[] as string[][]; for(let i=0;i<ids.length;i+=50)chunks.push(ids.slice(i,i+50))
 const out:any[]=[]
 for(const c of chunks){try{const d=await json(`${GAMES}/v1/games?universeIds=${c.join(',')}`);out.push(...(d.data||[]))}catch{}}
 return out
}

async function loadGame(id:string){
 const [detail,vote,fav,thumb,media,recs]=await Promise.allSettled([
   json(`${GAMES}/v1/games?universeIds=${id}`),
   json(`${GAMES}/v1/games/${id}/votes`),
   json(`${GAMES}/v1/games/${id}/favorites/count`),
   json(`${THUMBS}/v1/games/icons?universeIds=${id}&returnPolicy=PlaceHolder&size=420x420&format=Png&isCircular=false`),
   json(`${GAMES}/v2/games/${id}/media`),
   json(`${GAMES}/v1/games/recommendations/game/${id}`)
 ])
 const d=detail.status==='fulfilled'?(detail.value?.data?.[0]||{}):{}
 const v=vote.status==='fulfilled'?vote.value||{}:{}
 const icon=thumb.status==='fulfilled'?(thumb.value?.data?.[0]?.imageUrl||null):null
 const favCount=fav.status==='fulfilled'?(fav.value?.favoritesCount??fav.value?.count??null):null
 const m=media.status==='fulfilled'?media.value?.data||[]:[]
 const recommendations=recs.status==='fulfilled'?(recs.value?.games||recs.value?.data||[]):[]
 const likes=v?.upVotes??d?.upVotes??null, dislikes=v?.downVotes??d?.downVotes??null
 const rating=likes!=null&&dislikes!=null&&likes+dislikes>0?likes/(likes+dislikes)*100:null
 return {id,name:d.name||'Unknown',description:d.description||'',creator:d.creator||{},created:d.created||null,updated:d.updated||null,placeId:d.rootPlaceId||null,playing:d.playing??0,visits:d.visits??0,favorites:d.favoritedCount??favCount??0,likes,dislikes,rating,price:d.price??null,maxPlayers:d.maxPlayers??null,serverSize:d.maxPlayers??null,studioAccess:d.studioAccessToPlaceId??null,genre:d.genre||d.genreDisplayName||null,avatarType:d.universeAvatarType||null,privateServerPrice:d.privateServerPrice??null,icon,media:m,recommendations,raw:d}
}