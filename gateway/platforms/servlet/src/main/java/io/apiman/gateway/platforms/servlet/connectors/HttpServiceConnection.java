/*
 * Copyright 2014 JBoss Inc
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package io.apiman.gateway.platforms.servlet.connectors;

import io.apiman.gateway.engine.IServiceConnection;
import io.apiman.gateway.engine.IServiceConnectionResponse;
import io.apiman.gateway.engine.async.AsyncResultImpl;
import io.apiman.gateway.engine.async.IAsyncHandler;
import io.apiman.gateway.engine.async.IAsyncResultHandler;
import io.apiman.gateway.engine.beans.Service;
import io.apiman.gateway.engine.beans.ServiceRequest;
import io.apiman.gateway.engine.beans.ServiceResponse;
import io.apiman.gateway.engine.beans.exceptions.ConnectorException;
import io.apiman.gateway.engine.io.IApimanBuffer;
import io.apiman.gateway.platforms.servlet.GatewayThreadContext;
import io.apiman.gateway.platforms.servlet.io.ByteBuffer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.cert.X509Certificate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import org.apache.commons.io.IOUtils;

/**
 * Models a live connection to a back end service.
 *
 * @author eric.wittmann@redhat.com
 */
public class HttpServiceConnection implements IServiceConnection, IServiceConnectionResponse {

    private static SSLContext sslContext;
    private static HostnameVerifier allHostsValid;
    private static final Set<String> SUPPRESSED_HEADERS = new HashSet<>();
    static {
        SUPPRESSED_HEADERS.add("Transfer-Encoding"); //$NON-NLS-1$
        SUPPRESSED_HEADERS.add("Content-Length"); //$NON-NLS-1$
        SUPPRESSED_HEADERS.add("X-API-Key"); //$NON-NLS-1$

        TrustManager[] trustAllCerts = new TrustManager[] { new X509TrustManager() {
            @Override
            public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                return null;
            }
            @Override
            public void checkClientTrusted(X509Certificate[] certs, String authType) {
            }
            @Override
            public void checkServerTrusted(X509Certificate[] certs, String authType) {
            }
        } };
        try {
            sslContext = SSLContext.getInstance("SSL"); //$NON-NLS-1$
            sslContext.init(null, trustAllCerts, new java.security.SecureRandom());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        allHostsValid = new HostnameVerifier() {
            @Override
            public boolean verify(String hostname, SSLSession session) {
                return true;
            }
        };
    }

    private ServiceRequest request;
    private Service service;
    private IAsyncResultHandler<IServiceConnectionResponse> responseHandler;
    private boolean connected;

    private HttpURLConnection connection;
    private OutputStream outputStream;

    private IAsyncHandler<IApimanBuffer> bodyHandler;
    private IAsyncHandler<Void> endHandler;

    private ServiceResponse response;

    /**
     * Constructor.
     * @param request the request
     * @param service the service
     * @param handler the result handler
     * @throws ConnectorException when unable to connect
     */
    public HttpServiceConnection(ServiceRequest request, Service service,
            IAsyncResultHandler<IServiceConnectionResponse> handler) throws ConnectorException {
        this.request = request;
        this.service = service;
        this.responseHandler = handler;

        connect();
    }

    /**
     * Connects to the back end system.
     */
    private void connect() throws ConnectorException {
        try {
            String endpoint = service.getEndpoint();
            if (endpoint.endsWith("/")) { //$NON-NLS-1$
                endpoint = endpoint.substring(0, endpoint.length() - 1);
            }
            if (request.getDestination() != null) {
                endpoint += request.getDestination();
            }
            if (request.getQueryParams() != null && !request.getQueryParams().isEmpty()) {
                String delim = "?"; //$NON-NLS-1$
                for (Entry<String, String> entry : request.getQueryParams().entrySet()) {
                    endpoint += delim + entry.getKey();
                    if (entry.getValue() != null) {
                        endpoint += "=" + URLEncoder.encode(entry.getValue(), "UTF-8"); //$NON-NLS-1$ //$NON-NLS-2$
                    }
                    delim = "&"; //$NON-NLS-1$
                }
            }
            URL url = new URL(endpoint);
            connection = (HttpURLConnection) url.openConnection();
            // Disable the SSL trust manager so we can connect to any SSL endpoint.
            // TODO make this optional at some level.  also allow individual certs to be somehow configured
            if (connection instanceof HttpsURLConnection) {
                HttpsURLConnection https = (HttpsURLConnection) connection;
                https.setSSLSocketFactory(sslContext.getSocketFactory());
                https.setHostnameVerifier(allHostsValid);
            }
            connection.setReadTimeout(15000);
            connection.setConnectTimeout(10000);
            if (request.getType().equalsIgnoreCase("PUT") || request.getType().equalsIgnoreCase("POST")) { //$NON-NLS-1$ //$NON-NLS-2$
                connection.setDoOutput(true);
            } else {
                connection.setDoOutput(false);
            }
            connection.setDoInput(true);
            connection.setUseCaches(false);
            connection.setRequestMethod(request.getType());

            // Set the request headers
            for (Entry<String, String> entry : request.getHeaders().entrySet()) {
                String hname = entry.getKey();
                String hval = entry.getValue();
                if (!SUPPRESSED_HEADERS.contains(hname)) {
                    connection.setRequestProperty(hname, hval);
                }
            }

            connection.connect();
            connected = true;
        } catch (IOException e) {
            throw new ConnectorException(e);
        }
    }

    /**
     * @see io.apiman.gateway.engine.io.IReadStream#bodyHandler(io.apiman.gateway.engine.async.IAsyncHandler)
     */
    @Override
    public void bodyHandler(IAsyncHandler<IApimanBuffer> bodyHandler) {
        this.bodyHandler = bodyHandler;
    }

    /**
     * @see io.apiman.gateway.engine.io.IReadStream#endHandler(io.apiman.gateway.engine.async.IAsyncHandler)
     */
    @Override
    public void endHandler(IAsyncHandler<Void> endHandler) {
        this.endHandler = endHandler;
    }

    /**
     * @see io.apiman.gateway.engine.io.IReadStream#getHead()
     */
    @Override
    public ServiceResponse getHead() {
        return response;
    }

    /**
     * @see io.apiman.gateway.engine.io.IStream#isFinished()
     */
    @Override
    public boolean isFinished() {
        return !connected;
    }

    /**
     * @see io.apiman.gateway.engine.io.IAbortable#abort()
     */
    @Override
    public void abort() {
        try {
            if (connection != null) {
                IOUtils.closeQuietly(outputStream);
                IOUtils.closeQuietly(connection.getInputStream());
                connected = false;
                connection.disconnect();
            }
        } catch (IOException e) {
            // TODO log this error but don't rethrow it
        }
    }

    /**
     * @see io.apiman.gateway.engine.io.IWriteStream#write(io.apiman.gateway.engine.io.IApimanBuffer)
     */
    @Override
    public void write(IApimanBuffer chunk) {
        try {
            if (outputStream == null) {
                outputStream = connection.getOutputStream();
            }
            if (chunk instanceof ByteBuffer) {
                byte [] buffer = (byte []) chunk.getNativeBuffer();
                outputStream.write(buffer, 0, chunk.length());
            } else {
                outputStream.write(chunk.getBytes());
            }
        } catch (IOException e) {
            // TODO log this error.
            throw new ConnectorException(e);
        }
    }

    /**
     * @see io.apiman.gateway.engine.io.IWriteStream#end()
     */
    @Override
    public void end() {
        try {
            IOUtils.closeQuietly(outputStream);
            outputStream = null;
            // Process the response, convert to a ServiceResponse object, and return it
            response = GatewayThreadContext.getServiceResponse();
            Map<String, List<String>> headerFields = connection.getHeaderFields();
            for (String headerName : headerFields.keySet()) {
                if (headerName != null) {
                    response.getHeaders().put(headerName, connection.getHeaderField(headerName));
                }
            }
            response.setCode(connection.getResponseCode());
            response.setMessage(connection.getResponseMessage());
            responseHandler.handle(AsyncResultImpl.<IServiceConnectionResponse>create(this));
        } catch (Exception e) {
            // TODO log this error
            throw new ConnectorException(e);
        }
    }

    /**
     * @see io.apiman.gateway.engine.io.ISignalReadStream#transmit()
     */
    @Override
    public void transmit() {
        try {
            InputStream is = connection.getInputStream();
            ByteBuffer buffer = new ByteBuffer(2048);
            int numBytes = buffer.readFrom(is);
            while (numBytes != -1) {
                bodyHandler.handle(buffer);
                numBytes = buffer.readFrom(is);
            }
            IOUtils.closeQuietly(is);
            connection.disconnect();
            connected = false;
            endHandler.handle(null);
        } catch (Throwable e) {
            // At this point we're sort of screwed, because we've already sent the response to
            // the originating client - and we're in the process of sending the body data.  So
            // I guess the only thing to do is abort() the connection and cross our fingers.
            if (connected) {
                abort();
            }
            throw new RuntimeException(e);
        }
    }

}
