const fs=require('node:fs/promises'),path=require('node:path');
module.exports=async(asset,dir,options,run)=>{
 if(asset.kind!=='video')return asset;
 if(asset.filmstripPath){try{await fs.access(asset.filmstripPath);return asset}catch{}}
 const output=path.join(dir,asset.id+'-filmstrip.jpg');
 await run(path.join(options.ffmpegBin,'ffmpeg.exe'),['-v','error','-y','-i',asset.path,'-vf',`fps=${12/asset.duration},scale=128:72:force_original_aspect_ratio=increase,crop=128:72,setsar=1,tile=12x1`,'-frames:v','1','-q:v','4',output],options);
 return {...asset,filmstripPath:output,filmstripFrames:12};
};
