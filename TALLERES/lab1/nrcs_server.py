#!/usr/bin/env python3
# nrcs_server.py
# Servidor simple de NRCs (secuencial) que responde a BUSCAR|NRC y LISTAR

import socket
import csv
import json
import os

ARCHIVO_NRCS = 'nrcs.csv'
HOST = 'localhost'
PORT = 12346
BUFFER_SIZE = 4096

def inicializar_nrcs():
    if not os.path.exists(ARCHIVO_NRCS):
        with open(ARCHIVO_NRCS, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['NRC', 'Materia'])
            # Puedes agregar algunos NRCs de ejemplo:
            writer.writerow(['MAT101', 'Matemáticas I'])
            writer.writerow(['INF202', 'Programación II'])
            writer.writerow(['FIS150', 'Física General'])
        print(f"[init] Archivo creado: {ARCHIVO_NRCS}")

def listar_nrcs():
    try:
        with open(ARCHIVO_NRCS, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            data = list(reader)
        return {"status": "ok", "data": data}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def buscar_nrc(nrc):
    try:
        with open(ARCHIVO_NRCS, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['NRC'] == nrc:
                    return {"status": "ok", "data": row}
        return {"status": "not_found", "mensaje": "NRC no encontrado"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def procesar_comando(comando):
    partes = comando.strip().split('|')
    op = partes[0].upper()
    try:
        if op == 'BUSCAR' and len(partes) == 2:
            return buscar_nrc(partes[1])
        elif op == 'LISTAR':
            return listar_nrcs()
        else:
            return {"status": "error", "mensaje": "Comando inválido"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def main():
    inicializar_nrcs()
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind((HOST, PORT))
    server_socket.listen(1)
    print(f"[nrcs] Servidor de NRCs escuchando en {HOST}:{PORT} ...")
    try:
        while True:
            client_socket, addr = server_socket.accept()
            print(f"[nrcs] Conexión desde {addr}")
            try:
                data = client_socket.recv(BUFFER_SIZE).decode('utf-8')
                if data:
                    print(f"[nrcs] Recibido: {data}")
                    respuesta = procesar_comando(data)
                    client_socket.send(json.dumps(respuesta, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                print(f"[nrcs] Error: {e}")
            finally:
                client_socket.close()
                print(f"[nrcs] Desconectado {addr}")
    except KeyboardInterrupt:
        print("\n[nrcs] Servidor NRCs detenido por teclado.")
    finally:
        server_socket.close()

if __name__ == '__main__':
    main()
