"""
cristallo.py — un asset di gioco generato e renderizzato SENZA display, senza GPU.

    blender --background --factory-startup --python cristallo.py -- --outdir <cartella> --frame <n> --passo <gradi>

Costruisce un cristallo d'ambra su una base rocciosa, lo illumina come in un gioco (key calda,
fill freddo), lo renderizza con Cycles su CPU a fondo trasparente e salva un PNG.
Con --frame e --passo produce una sequenza di rotazioni: è il modo in cui si fabbrica uno
SPRITE SHEET da un modello 3D (la tecnica «2.5D» usata da molti giochi indie: modelli veri,
inquadratura fissa, sprite 2D per il motore).
"""
import bpy, math, sys, time, os

def argomenti():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opt = {"outdir": ".", "frame": 0, "sequenza": 1, "passo": 45.0, "lato": 512, "campioni": 64}
    i = 0
    while i < len(a):
        if a[i] == "--outdir": opt["outdir"] = a[i+1]; i += 2
        elif a[i] == "--frame": opt["frame"] = int(a[i+1]); i += 2
        elif a[i] == "--sequenza": opt["sequenza"] = int(a[i+1]); i += 2
        elif a[i] == "--passo": opt["passo"] = float(a[i+1]); i += 2
        elif a[i] == "--lato": opt["lato"] = int(a[i+1]); i += 2
        elif a[i] == "--campioni": opt["campioni"] = int(a[i+1]); i += 2
        else: i += 1
    return opt


def materiale(nome, colore, ruvidita=0.35, metallo=0.0, emissione=None, forza=2.0, trasmissione=0.0):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*colore, 1)
    p.inputs["Roughness"].default_value = ruvidita
    p.inputs["Metallic"].default_value = metallo
    for chiave, valore in (("Transmission Weight", trasmissione), ("Transmission", trasmissione)):
        if chiave in p.inputs and valore:
            p.inputs[chiave].default_value = valore
            break
    if emissione:
        for chiave in ("Emission Color", "Emission"):
            if chiave in p.inputs:
                p.inputs[chiave].default_value = (*emissione, 1)
                break
        if "Emission Strength" in p.inputs:
            p.inputs["Emission Strength"].default_value = forza
    return m

def aggiungi(obj, materiale):
    obj.data.materials.append(materiale)
    return obj

def costruisci():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene

    # --- base rocciosa: un cilindro basso e irregolare, come il piedistallo di un prop
    bpy.ops.mesh.primitive_cylinder_add(vertices=9, radius=0.95, depth=0.28, location=(0, 0, -0.14))
    base = bpy.context.active_object
    base.name = "base"
    roccia = materiale("roccia", (0.28, 0.30, 0.32), ruvidita=0.85)
    aggiungi(base, roccia)

    # --- cristallo: un prisma a 6 facce con punta, leggermente inclinato
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.42, radius2=0.30, depth=1.5,
                                    location=(0, 0, 0.75))
    corpo = bpy.context.active_object
    corpo.name = "cristallo"
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.30, radius2=0.0, depth=0.55,
                                    location=(0, 0, 1.75))
    punta = bpy.context.active_object
    punta.name = "punta"
    ambra = materiale("ambra", (0.78, 0.42, 0.06), ruvidita=0.10, trasmissione=0.30,
                      emissione=(1.0, 0.55, 0.12), forza=0.55)
    aggiungi(corpo, ambra); aggiungi(punta, ambra)

    # --- camera ortografica in vista isometrica (niente prospettiva: stile 2D)
    bpy.ops.object.camera_add(location=(3.6, -3.6, 3.0))
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 3.1
    bpy.ops.object.empty_add(location=(0, 0, 0.8))
    mira = bpy.context.active_object
    c = cam.constraints.new(type="TRACK_TO")
    c.target = mira; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
    s.camera = cam

    # --- luci: key calda, fill freddo, rim
    bpy.ops.object.light_add(type="AREA", location=(2.4, -2.2, 3.4))
    key = bpy.context.active_object
    key.data.energy = 220; key.data.size = 2.6; key.data.color = (1.0, 0.88, 0.70)
    ct = key.constraints.new(type="TRACK_TO"); ct.target = mira
    ct.track_axis = "TRACK_NEGATIVE_Z"; ct.up_axis = "UP_Y"

    bpy.ops.object.light_add(type="AREA", location=(-2.8, -1.2, 1.6))
    fill = bpy.context.active_object
    fill.data.energy = 55; fill.data.size = 4.0; fill.data.color = (0.60, 0.72, 1.0)
    cf = fill.constraints.new(type="TRACK_TO"); cf.target = mira
    cf.track_axis = "TRACK_NEGATIVE_Z"; cf.up_axis = "UP_Y"

    # --- mondo scuro: il cristallo deve staccare
    mondo = bpy.data.worlds.new("mondo")
    s.world = mondo
    mondo.use_nodes = True
    sfondo = mondo.node_tree.nodes["Background"]
    sfondo.inputs[0].default_value = (0.05, 0.06, 0.08, 1)
    sfondo.inputs[1].default_value = 0.22

    # --- resa: Cycles su CPU, fondo trasparente, denoise
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = CAMPIONI
    # Il pacchetto Blender di Ubuntu è compilato SENZA OpenImageDenoise: accendere il denoise
    # fa fallire il render. Si compensa con più campioni.
    try:
        s.cycles.use_denoising = False
    except Exception:
        pass
    s.render.resolution_x = LATO
    s.render.resolution_y = LATO
    s.render.film_transparent = True
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    # "Standard" tiene i colori saturi: per uno sprite di gioco è più prevedibile delle
    # trasformazioni filmiche, che schiariscono e desaturano.
    s.view_settings.view_transform = "Standard"
    return corpo, punta

opt = argomenti()
LATO = opt["lato"]; CAMPIONI = opt["campioni"]
os.makedirs(opt["outdir"], exist_ok=True)

corpo, punta = costruisci()
# Un'invocazione, N rotazioni: è così che si fabbrica uno sprite sheet da un modello 3D.
tutto = time.time()
for indice in range(opt["sequenza"]):
    frame = opt["frame"] + indice
    angolo = math.radians(opt["passo"] * frame)
    for o in (corpo, punta):
        o.rotation_euler = (0, 0, angolo)
    nome = f"cristallo-{frame:02d}.png"
    bpy.context.scene.render.filepath = os.path.join(opt["outdir"], nome)
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"RESO {nome} in {time.time() - t:.1f}s ({LATO}px, {CAMPIONI} campioni, CPU)")
print(f"SEQUENZA {opt['sequenza']} frame in {time.time() - tutto:.1f}s")
