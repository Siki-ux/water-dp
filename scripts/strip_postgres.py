import yaml
import sys

def strip_deps(filepath, outpath, req_services):
    with open(filepath, 'r') as f:
        data = yaml.safe_load(f)
    
    # Services that legitimately depend on postgres-app and must keep that dependency.
    KEEP_POSTGRES_DEP = {'geoserver-init'}

    for svc_name, svc in data.get('services', {}).items():
        if svc_name in KEEP_POSTGRES_DEP:
            continue
        if 'depends_on' in svc:
            if isinstance(svc['depends_on'], dict):
                if 'postgres-app' in svc['depends_on']:
                    del svc['depends_on']['postgres-app']
            elif isinstance(svc['depends_on'], list):
                if 'postgres-app' in svc['depends_on']:
                    svc['depends_on'].remove('postgres-app')
            
            if not svc['depends_on']:
                del svc['depends_on']

        # Fix podman-compose profile bug: if explicitly requested, remove the profile array
        if req_services and svc_name in req_services:
            if 'profiles' in svc:
                del svc['profiles']

        if 'environment' in svc and isinstance(svc['environment'], list):
            env_dict = {}
            for env_item in svc['environment']:
                if '=' in env_item:
                    k, v = env_item.split('=', 1)
                    env_dict[k] = v
                else:
                    env_dict[env_item] = None
            svc['environment'] = env_dict

    with open(outpath, 'w') as f:
        yaml.safe_dump(data, f, default_flow_style=False, sort_keys=False)

if __name__ == "__main__":
    requested = sys.argv[1:] if len(sys.argv) > 1 else []
    strip_deps('docker-compose.yml', 'docker-compose.podman.yml', requested)
    strip_deps('docker-compose.tsm.yml', 'docker-compose.tsm.podman.yml', requested)
