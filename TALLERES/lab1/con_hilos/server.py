#!/usr/bin/env python3
# con_hilos/server.py
# Servidor concurrente para registro de calificaciones (usa threading + Lock)
# Por defecto asume archivo calificaciones.csv ubicado en el directorio padre (../calificaciones.csv)
# Si prefieres usar el mismo directorio, cambia ARCHIVO_CSV = 'calificaciones.csv'

import socket
import csv
import json
import os
import threading

ARCHIVO_CSV = '../calificaciones.csv'  # según la estructura del enunciado
HOST = 'localhost'
PORT = 12345
BUFFER_SIZE = 4096

lock = threading.Lock()  # para proteger el acceso al CSV

# Inicializa el CSV si no existe
def inicializar_csv():
    ruta = ARCHIVO_CSV
    carpeta = os.path.dirname(ruta)
    if carpeta and not os.path.exists(carpeta):
        os.makedirs(carpeta, exist_ok=True)
    if not os.path.exists(ruta):
        with open(ruta, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['ID_Estudiante', 'Nombre', 'Materia', 'Calificacion'])
        print(f"[init] Archivo creado: {ruta}")

# Funciones CRUD similares, pero usando lock para operaciones de escritura/lectura
def agregar_calificacion(id_est, nombre, materia, calif):
    try:
        # Validar existencia de NRC opcional: aquí no se valida. La validación se realizará
        # si implementas la función consultar_nrc() y la llamas antes de escribir.
        with lock:
            with open(ARCHIVO_CSV, 'a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([id_est, nombre, materia, calif])
        return {"status": "ok", "mensaje": f"Calificación agregada para {nombre}"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def buscar_por_id(id_est):
    try:
        with lock:
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
        with lock:
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
        with lock:
            with open(ARCHIVO_CSV, 'r', newline='', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                data = list(reader)
        return {"status": "ok", "data": data}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def eliminar_por_id(id_est):
    try:
        removed = False
        with lock:
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

# Comunicación con servidor de NRCs (puerto 12346)
def consultar_nrc(nrc, host='localhost', port=12346, timeout=3):
    try:
        with socket.create_connection((host, port), timeout=timeout) as s:
            cmd = f"BUSCAR|{nrc}"
            s.send(cmd.encode('utf-8'))
            respuesta = s.recv(BUFFER_SIZE).decode('utf-8')
            try:
                return json.loads(respuesta)
            except:
                return {"status": "error", "mensaje": "Respuesta NRC no válida"}
    except Exception as e:
        return {"status": "error", "mensaje": f"Error consultando NRC: {e}"}

def procesar_comando(comando):
    partes = comando.strip().split('|')
    op = partes[0].upper()
    try:
        if op == 'AGREGAR' and len(partes) == 5:
            # Validar NRC antes de agregar
            materia = partes[3]
            res_nrc = consultar_nrc(materia)
            if res_nrc.get('status') != 'ok':
                return {"status": "error", "mensaje": "Materia/NRC no válida"}
            return agregar_calificacion(partes[1], partes[2], materia, partes[4])
        elif op == 'BUSCAR' and len(partes) == 2:
            return buscar_por_id(partes[1])
        elif op == 'ACTUALIZAR' and len(partes) == 3:
            # Para actualizar calificación no se cambia materia, solo calif
            return actualizar_calificacion(partes[1], partes[2])
        elif op == 'LISTAR':
            return listar_todas()
        elif op == 'ELIMINAR' and len(partes) == 2:
            return eliminar_por_id(partes[1])
        else:
            return {"status": "error", "mensaje": "Comando inválido"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def manejar_cliente(client_socket, addr):
    hilo = threading.current_thread().name
    print(f"[{hilo}] Cliente conectado desde {addr}")
    try:
        data = client_socket.recv(BUFFER_SIZE).decode('utf-8')
        if data:
            print(f"[{hilo}] Recibido: {data}")
            respuesta = procesar_comando(data)
            client_socket.send(json.dumps(respuesta, ensure_ascii=False).encode('utf-8'))
    except Exception as e:
        print(f"[{hilo}] Error en hilo: {e}")
    finally:
        client_socket.close()
        print(f"[{hilo}] Cliente {addr} desconectado.")

def main():
    inicializar_csv()
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind((HOST, PORT))
    server_socket.listen(5)
    print(f"[server] Servidor concurrente escuchando en {HOST}:{PORT} ...")
    try:
        while True:
            client_socket, addr = server_socket.accept()
            hilo = threading.Thread(target=manejar_cliente, args=(client_socket, addr), daemon=True)
            hilo.start()
    except KeyboardInterrupt:
        print("\n[stop] Servidor detenido por teclado.")
    finally:
        server_socket.close()

if __name__ == '__main__':
    main()
