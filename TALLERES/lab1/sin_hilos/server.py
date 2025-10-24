#!/usr/bin/env python3
# sin_hilos/server.py
# Servidor secuencial para registro de calificaciones (sin concurrencia)

import socket
import csv
import json
import os

ARCHIVO_CSV = 'calificaciones.csv'
HOST = 'localhost'
PORT = 12345
BUFFER_SIZE = 4096

# Inicializa el CSV si no existe
def inicializar_csv():
    if not os.path.exists(ARCHIVO_CSV):
        with open(ARCHIVO_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['ID_Estudiante', 'Nombre', 'Materia', 'Calificacion'])
        print(f"[init] Archivo creado: {ARCHIVO_CSV}")

def agregar_calificacion(id_est, nombre, materia, calif):
    try:
        # No validación de NRC aquí (versión sin extensión)
        with open(ARCHIVO_CSV, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([id_est, nombre, materia, calif])
        return {"status": "ok", "mensaje": f"Calificación agregada para {nombre}"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def buscar_por_id(id_est):
    try:
        with open(ARCHIVO_CSV, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['ID_Estudiante'] == id_est:
                    return {"status": "ok", "data": row}
        return {"status": "not_found", "mensaje": "ID no encontrado"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def actualizar_calificacion(id_est, nueva_calif):
    try:
        updated = False
        rows = []
        with open(ARCHIVO_CSV, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['ID_Estudiante'] == id_est:
                    row['Calificacion'] = nueva_calif
                    updated = True
                rows.append(row)
        if not updated:
            return {"status": "not_found", "mensaje": "ID no encontrado"}

        with open(ARCHIVO_CSV, 'w', newline='', encoding='utf-8') as f:
            fieldnames = ['ID_Estudiante', 'Nombre', 'Materia', 'Calificacion']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        return {"status": "ok", "mensaje": "Calificación actualizada"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def listar_todas():
    try:
        with open(ARCHIVO_CSV, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            data = list(reader)
        return {"status": "ok", "data": data}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def eliminar_por_id(id_est):
    try:
        removed = False
        rows = []
        with open(ARCHIVO_CSV, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['ID_Estudiante'] == id_est:
                    removed = True
                    continue
                rows.append(row)
        if not removed:
            return {"status": "not_found", "mensaje": "ID no encontrado"}

        with open(ARCHIVO_CSV, 'w', newline='', encoding='utf-8') as f:
            fieldnames = ['ID_Estudiante', 'Nombre', 'Materia', 'Calificacion']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        return {"status": "ok", "mensaje": "Registro eliminado"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def procesar_comando(comando):
    partes = comando.strip().split('|')
    op = partes[0].upper()
    try:
        if op == 'AGREGAR' and len(partes) == 5:
            return agregar_calificacion(partes[1], partes[2], partes[3], partes[4])
        elif op == 'BUSCAR' and len(partes) == 2:
            return buscar_por_id(partes[1])
        elif op == 'ACTUALIZAR' and len(partes) == 3:
            return actualizar_calificacion(partes[1], partes[2])
        elif op == 'LISTAR':
            return listar_todas()
        elif op == 'ELIMINAR' and len(partes) == 2:
            return eliminar_por_id(partes[1])
        else:
            return {"status": "error", "mensaje": "Comando inválido"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def main():
    inicializar_csv()
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind((HOST, PORT))
    server_socket.listen(1)
    print(f"[server] Servidor secuencial escuchando en {HOST}:{PORT} ...")
    try:
        while True:
            client_socket, addr = server_socket.accept()
            print(f"[connect] Cliente conectado desde {addr}")
            try:
                data = client_socket.recv(BUFFER_SIZE).decode('utf-8')
                if data:
                    print(f"[recv] {data}")
                    respuesta = procesar_comando(data)
                    client_socket.send(json.dumps(respuesta, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                print(f"[error] En procesamiento: {e}")
            finally:
                client_socket.close()
                print("[disconnect] Cliente desconectado.")
    except KeyboardInterrupt:
        print("\n[stop] Servidor detenido por teclado.")
    finally:
        server_socket.close()

if __name__ == '__main__':
    main()
